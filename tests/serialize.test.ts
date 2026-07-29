import { describe, it, expect } from "vitest";
import {
  rowToDish,
  dishToRow,
  rowToZone,
  rowToOrder,
  rowToUser,
} from "@/lib/serialize";
import type {
  Dish as DishRow,
  Zone as ZoneRow,
  Order as OrderRow,
  User as UserRow,
} from "@prisma/client";

/* Les conversions sont maintenant typées avec les modèles Prisma : les fixtures
 * doivent donc être des lignes complètes. Ces fabriques évitent de recopier
 * quinze champs à chaque test, et documentent au passage la forme réelle des
 * lignes en base. */

const NOW = new Date("2026-06-01T12:00:00.000Z");

const dishRow = (over: Partial<DishRow> = {}): DishRow => ({
  id: "d1",
  cat: "africaine",
  name: "Tcheb Poulet",
  desc: "Riz au gras",
  priceCents: 1100,
  photo: "/photos/p04.jpg",
  badge: null,
  popular: true,
  available: true,
  spice: 0,
  tags: '["Populaire"]',
  options: '[{"name":"Riz","required":true,"choices":[{"l":"Riz blanc"}]}]',
  formules: null,
  allergens: "[]",
  stock: null,
  stockAlert: null,
  costCents: null,
  position: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const zoneRow = (over: Partial<ZoneRow> = {}): ZoneRow => ({
  id: "z1",
  idx: 0,
  feeCents: 250,
  minimumCents: 1500,
  cities: '["Lognes","Torcy"]',
  zips: '["77185","77200"]',
  active: true,
  ...over,
});

const orderRow = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: "o1",
  ref: "#AB12CD",
  invoiceNumber: 42,
  userId: null,
  mode: "livraison",
  status: "confirmee",
  zoneIdx: 0,
  slot: "asap",
  customerName: "Awa",
  customerEmail: "awa@x.fr",
  customerPhone: "0612345678",
  address: "1 rue",
  city: "Lognes",
  zip: "77185",
  subtotalCents: 2200,
  discountCents: 0,
  feeCents: 250,
  totalCents: 2450,
  vatRateBp: 1000,
  promotionId: null,
  promoCode: null,
  paid: true,
  paymentStatus: "paye",
  paymentMethod: "Carte bancaire",
  stripeSessionId: null,
  stripePaymentIntentId: null,
  driverId: null,
  deliveryRunId: null,
  runPosition: null,
  lines:
    '[{"dishId":"d1","name":"Tcheb","photo":null,"unitPriceCents":1100,"qty":2,"lineTotalCents":2200,"opts":{},"formule":null,"note":""}]',
  confirmedAt: NOW,
  cookingAt: null,
  routeAt: null,
  deliveredAt: null,
  canceledAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const userRow = (over: Partial<UserRow> = {}): UserRow => ({
  id: "u1",
  name: "Awa",
  email: "awa@x.fr",
  phone: "0612345678",
  password: "$2a$12$hash",
  role: "CLIENT",
  favorites: '["d1","d2"]',
  addresses:
    '[{"id":"a1","label":"Domicile","address":"1 rue","zip":"77185","city":"Lognes"}]',
  createdAt: NOW,
  ...over,
});

describe("rowToDish", () => {
  it("désérialise les champs JSON (tags, options, formules)", () => {
    const d = rowToDish(dishRow());
    expect(d.name).toBe("Tcheb Poulet");
    expect(d.priceCents).toBe(1100);
    expect(d.tags).toEqual(["Populaire"]);
    expect(d.options[0].name).toBe("Riz");
    expect(d.formules).toBeUndefined();
  });

  it("tolère un JSON corrompu en renvoyant un défaut", () => {
    const d = rowToDish(dishRow({ tags: "{bad", options: "nope", priceCents: null }));
    expect(d.tags).toEqual([]);
    expect(d.options).toEqual([]);
    expect(d.priceCents).toBeNull();
  });

  it("ne garde que les allergènes de la liste réglementaire", () => {
    const d = rowToDish(dishRow({ allergens: '["gluten","licorne","sesame"]' }));
    expect(d.allergens).toEqual(["gluten", "sesame"]);
  });

  it("expose le stock, le seuil d'alerte et le coût matière", () => {
    const d = rowToDish(dishRow({ stock: 4, stockAlert: 5, costCents: 400 }));
    expect(d.stock).toBe(4);
    expect(d.stockAlert).toBe(5);
    expect(d.costCents).toBe(400);
  });
});

describe("dishToRow", () => {
  it("sérialise tags, options et formules en JSON, et ignore les champs absents", () => {
    const row = dishToRow({ name: "X", tags: ["a", "b"], formules: [["Seul", 700]] });
    expect(row.name).toBe("X");
    expect(row.tags).toBe('["a","b"]');
    expect(row.formules).toBe('[["Seul",700]]');
    expect("priceCents" in row).toBe(false);
  });

  it("n'inclut pas formules quand la clé est absente", () => {
    expect("formules" in dishToRow({ formules: undefined })).toBe(false);
  });

  /** Liste blanche : un champ hors du domaine ne doit jamais atteindre la base. */
  it("ignore les champs inconnus (pas de mass assignment)", () => {
    const row = dishToRow({ name: "X", id: "usurpé" } as never);
    expect("id" in row).toBe(false);
  });
});

describe("rowToZone", () => {
  it("expose les montants en centimes et parse communes et codes postaux", () => {
    expect(rowToZone(zoneRow())).toEqual({
      idx: 0,
      feeCents: 250,
      minimumCents: 1500,
      villes: ["Lognes", "Torcy"],
      zips: ["77185", "77200"],
    });
  });

  it("tolère l'absence de codes postaux", () => {
    expect(rowToZone(zoneRow({ zips: "" })).zips).toEqual([]);
  });
});

describe("rowToOrder", () => {
  it("reconstruit la commande, le client et les lignes, et convertit la date", () => {
    const o = rowToOrder(orderRow());
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0].qty).toBe(2);
    expect(o.lines[0].unitPriceCents).toBe(1100);
    expect(o.lines[0].lineTotalCents).toBe(2200);
    expect(o.customer.name).toBe("Awa");
    expect(o.totalCents).toBe(2450);
    expect(o.invoiceNumber).toBe(42);
    expect(o.createdAt).toBe(NOW.getTime());
  });

  it("expose la remise et le code promotionnel", () => {
    const o = rowToOrder(orderRow({ discountCents: 300, promoCode: "BIENVENUE10" }));
    expect(o.discountCents).toBe(300);
    expect(o.promoCode).toBe("BIENVENUE10");
  });

  it("renvoie une liste vide plutôt que de casser sur des lignes corrompues", () => {
    expect(rowToOrder(orderRow({ lines: "{tronqué" })).lines).toEqual([]);
  });

  it("expose la chronologie des étapes, avec null pour celles qui n'ont pas eu lieu", () => {
    const delivered = new Date("2026-06-01T12:45:00.000Z");
    const o = rowToOrder(orderRow({ status: "livree", deliveredAt: delivered }));
    expect(o.timeline.confirmedAt).toBe(NOW.getTime());
    expect(o.timeline.deliveredAt).toBe(delivered.getTime());
    expect(o.timeline.cookingAt).toBeNull();
    expect(o.timeline.canceledAt).toBeNull();
  });

  it("reprend le nom du livreur quand la relation est incluse", () => {
    expect(rowToOrder(orderRow(), "Samir").driverName).toBe("Samir");
    expect(rowToOrder(orderRow()).driverName).toBeNull();
  });
});

describe("rowToUser", () => {
  it("parse les favoris et les adresses", () => {
    const u = rowToUser(userRow());
    expect(u.favorites).toEqual(["d1", "d2"]);
    expect(u.addresses[0].city).toBe("Lognes");
  });

  /** Régression volontaire : le hash ne doit jamais franchir cette frontière. */
  it("ne divulgue jamais le hash du mot de passe", () => {
    expect(JSON.stringify(rowToUser(userRow()))).not.toContain("$2a$");
    expect("password" in rowToUser(userRow())).toBe(false);
  });
});
