import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/checkout — la route qui fait vivre le restaurant.
 *
 * Tout le reste du dépôt peut se tromper sans conséquence immédiate ; ici, une
 * erreur se paie en argent, en plats sortis pour rien ou en commandes que la
 * cuisine ne verra jamais. Ce fichier éprouve donc quatre choses :
 *
 *  1. **aucun montant ne vient du navigateur**. C'était la faille principale de
 *     l'audit : un panier de 80 € pouvait être encaissé à 1 centime. Le corps
 *     dit *quoi* et *où*, jamais *combien* — et un `totalCents` glissé dedans
 *     doit rester sans effet, pas « seulement » être écrasé plus loin ;
 *  2. **ce qui est vendu existe et peut être servi** : plat présent, dispo, en
 *     stock, à une adresse livrable, pendant un service ouvert ;
 *  3. **un refus explique quoi faire**. Un client qui lit « Erreur » ferme
 *     l'onglet ; un client qui lit « Prochain service : mercredi à partir de
 *     18:00 » revient. Les messages font partie du contrat ;
 *  4. **le statut initial dit la vérité sur l'argent**. Espèces : la commande
 *     entre en cuisine. Carte : elle attend le webhook Stripe. Inverser les
 *     deux, c'est préparer des commandes jamais payées.
 *
 * ⚠️ `.env` pointe sur la base de production : Prisma, Stripe, Resend et
 * l'accès Google sont tous neutralisés ci-dessous. Aucun test n'ouvre de
 * connexion, n'envoie d'email ni ne consomme de quota.
 */

vi.mock("@/auth", async () => (await import("./aide/session")).moduleAuth());

/** Sous-ensemble des arguments Prisma réellement lus par les doubles. */
interface ArgsPrisma {
  where?: {
    id?: string | { in?: string[] };
    key?: string;
    code?: string;
    email?: string;
  };
  data?: Record<string, unknown>;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dish: {
      findMany: async (args: ArgsPrisma) => {
        const filtre = args.where?.id;
        const ids = typeof filtre === "object" && filtre ? (filtre.in ?? []) : [];
        return etat.plats.filter((p) => ids.includes(p.id));
      },
    },
    zone: { findMany: async () => etat.zones },
    formula: { findMany: async () => [] },
    promotion: {
      findUnique: async (args: ArgsPrisma) =>
        etat.promotions.find((p) => p.code === args.where?.code) ?? null,
      findMany: async () => etat.promotions.filter((p) => p.active && p.auto),
      update: async (args: ArgsPrisma) => {
        etat.promotionsIncrementees.push(String(args.where?.id ?? ""));
        return {};
      },
    },
    setting: {
      findMany: async () => Object.entries(etat.reglages).map(([key, value]) => ({ key, value })),
      findUnique: async (args: ArgsPrisma) => {
        const cle = args.where?.key ?? "";
        return cle in etat.reglages ? { key: cle, value: etat.reglages[cle] } : null;
      },
    },
    openingHours: { findMany: async () => [] },
    user: {
      findUnique: async (args: ArgsPrisma) =>
        etat.comptes.find((u) => u.email === args.where?.email) ?? null,
    },
    order: {
      count: async () => etat.commandesDejaPromo,
      create: async (args: ArgsPrisma) => {
        const row = {
          ...(args.data ?? {}),
          id: `cmd-${etat.commandes.length + 1}`,
          createdAt: new Date(),
        };
        etat.commandes.push(row);
        return row;
      },
      update: async (args: ArgsPrisma) => {
        const id = String(args.where?.id ?? "");
        const data = args.data ?? {};
        etat.majCommandes.push({ id, data });
        const row = etat.commandes.find((c) => c.id === id);
        if (row) Object.assign(row, data);
        return row ?? { id, ...data };
      },
      delete: async (args: ArgsPrisma) => {
        etat.supprimees.push(String(args.where?.id ?? ""));
        return {};
      },
    },
  },
}));

const sessionStripe = vi.fn();
const couponRecupere = vi.fn();
const couponCree = vi.fn();

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => etat.stripePret,
  stripe: {
    checkout: { sessions: { create: (...args: unknown[]) => sessionStripe(...args) } },
    coupons: {
      retrieve: (...args: unknown[]) => couponRecupere(...args),
      create: (...args: unknown[]) => couponCree(...args),
    },
  },
}));

const envoiConfirmation = vi.fn();
vi.mock("@/lib/email", () => ({
  sendOrderConfirmation: (...args: unknown[]) => envoiConfirmation(...args),
}));

const reserveStock = vi.fn();
const releaseStock = vi.fn();
vi.mock("@/lib/stock", () => ({
  reserveStock: (...args: unknown[]) => reserveStock(...args),
  releaseStock: (...args: unknown[]) => releaseStock(...args),
}));

/* La clé Google est active et chaque appel est facturé : la tarification à la
 * distance est coupée net, aucun test ne doit sortir sur le réseau. */
vi.mock("@/lib/geo", () => ({
  isGeoConfigured: () => false,
  roadDistanceKm: async () => null,
  measureDelivery: async () => ({ kind: "unknown" }),
  zipMismatchMessage: () => "",
  geocode: async () => null,
}));

import { POST } from "@/app/api/checkout/route";
import { LIMITS } from "@/lib/rateLimit";
import { appeler, type CorpsErreur } from "./aide/requete";
import { EMAIL_CLIENT, anonyme, enClient } from "./aide/session";

// ─── Base simulée ──────────────────────────────────────────────

/** Ligne `Dish` telle que `rowToDish()` la lit. */
interface LignePlat {
  id: string;
  cat: string;
  name: string;
  desc: string;
  priceCents: number | null;
  photo: string | null;
  badge: string | null;
  popular: boolean;
  available: boolean;
  spice: number;
  tags: string;
  options: string;
  formules: string | null;
  allergens: string;
  stock: number | null;
  stockAlert: number | null;
  costCents: number | null;
  position: number;
  leadTimeHours: number;
  vatRateBp: number;
}

interface LigneZone {
  idx: number;
  feeCents: number;
  minimumCents: number;
  cities: string;
  zips: string;
  active: boolean;
}

interface LignePromo {
  id: string;
  code: string | null;
  label: string;
  kind: string;
  value: number;
  minSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  oncePerCustomer: boolean;
  weekday: number | null;
  auto: boolean;
  active: boolean;
}

function plat(over: Partial<LignePlat> = {}): LignePlat {
  return {
    id: "plat-mafe",
    cat: "africaine",
    name: "Mafé Bœuf",
    desc: "Bœuf mijoté, sauce arachide",
    priceCents: 1200,
    photo: null,
    badge: null,
    popular: false,
    available: true,
    spice: 0,
    tags: "[]",
    options: "[]",
    formules: null,
    allergens: "[]",
    stock: null,
    stockAlert: null,
    costCents: null,
    position: 0,
    leadTimeHours: 0,
    vatRateBp: 1000,
    ...over,
  };
}

function promo(over: Partial<LignePromo> = {}): LignePromo {
  return {
    id: "promo-1",
    code: "BIENVENUE",
    label: "Bienvenue",
    kind: "amount",
    value: 240,
    minSubtotalCents: 0,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    usedCount: 0,
    oncePerCustomer: false,
    weekday: null,
    auto: false,
    active: true,
    ...over,
  };
}

const MAFE = plat();
const CANETTE = plat({ id: "boisson-coca", name: "Coca-Cola 33 cl", priceCents: 250, vatRateBp: 550 });
const GIGOT = plat({ id: "plat-gigot", name: "Gigot d'agneau", priceCents: 6500, leadTimeHours: 48 });
const AVEC_OPTIONS = plat({
  id: "plat-thieb",
  name: "Thiéboudiène",
  priceCents: 1400,
  options: JSON.stringify([
    {
      name: "Poisson",
      required: true,
      choices: [
        { l: "Daurade", priceCents: 0 },
        { l: "Poisson entier", priceCents: 900 },
      ],
    },
  ]),
});

const ZONE_PONTAULT: LigneZone = {
  idx: 0,
  feeCents: 300,
  minimumCents: 1500,
  cities: JSON.stringify(["Pontault-Combault"]),
  zips: JSON.stringify(["77340"]),
  active: true,
};

const etat = {
  plats: [] as LignePlat[],
  zones: [] as LigneZone[],
  promotions: [] as LignePromo[],
  reglages: {} as Record<string, string>,
  comptes: [] as { id: string; email: string }[],
  commandes: [] as Record<string, unknown>[],
  majCommandes: [] as { id: string; data: Record<string, unknown> }[],
  supprimees: [] as string[],
  promotionsIncrementees: [] as string[],
  commandesDejaPromo: 0,
  stripePret: true,
};

/** Mercredi 14 octobre 2026, 19 h à Paris : service du soir, créneaux 20:00 → 22:00. */
const EN_SERVICE = new Date("2026-10-14T17:00:00.000Z");
/** Même jour, 16 h : entre les deux services. */
const HORS_SERVICE = new Date("2026-10-14T14:00:00.000Z");

const CLIENT = { name: "Awa Diallo", email: EMAIL_CLIENT, phone: "06 12 34 56 78" };
const ADRESSE = { address: "12 rue des Prés", city: "Pontault-Combault", zip: "77340" };

interface CorpsCommande {
  lines?: unknown;
  mode?: string;
  slot?: string;
  scheduledDate?: string;
  customer?: Record<string, unknown>;
  promoCode?: string | null;
  paymentMethod?: string;
  [extra: string]: unknown;
}

/** Corps valide d'une commande à emporter réglée par carte. */
function corps(over: CorpsCommande = {}): CorpsCommande {
  return {
    lines: [{ dishId: MAFE.id, qty: 1 }],
    mode: "emporter",
    slot: "asap",
    customer: { ...CLIENT },
    paymentMethod: "Carte bancaire",
    ...over,
  };
}

interface CorpsCheckout extends CorpsErreur {
  url: string;
  orderId: string;
  demo?: boolean;
}

function commander(over: CorpsCommande = {}, ip?: string) {
  return appeler<CorpsCheckout>(POST, { chemin: "/api/checkout", corps: corps(over), ip });
}

/** Dernière commande écrite en base. */
function derniereCommande(): Record<string, unknown> {
  const row = etat.commandes.at(-1);
  if (!row) throw new Error("aucune commande créée");
  return row;
}

/** Lignes figées dans la commande (`Order.lines` est du JSON en TEXT). */
function lignesFigees(): { unitPriceCents: number; lineTotalCents: number; note: string }[] {
  return JSON.parse(String(derniereCommande().lines));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EN_SERVICE);
  anonyme();
  etat.plats = [MAFE, CANETTE, GIGOT, AVEC_OPTIONS];
  etat.zones = [ZONE_PONTAULT];
  etat.promotions = [];
  etat.reglages = {};
  etat.comptes = [];
  etat.commandes = [];
  etat.majCommandes = [];
  etat.supprimees = [];
  etat.promotionsIncrementees = [];
  etat.commandesDejaPromo = 0;
  etat.stripePret = true;
  sessionStripe.mockReset();
  sessionStripe.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/cs_test_1" });
  couponRecupere.mockReset();
  couponRecupere.mockResolvedValue({ id: "remise-240" });
  couponCree.mockReset();
  couponCree.mockResolvedValue({ id: "remise-240" });
  envoiConfirmation.mockReset();
  envoiConfirmation.mockResolvedValue(undefined);
  reserveStock.mockReset();
  reserveStock.mockResolvedValue({ ok: true });
  releaseStock.mockReset();
  releaseStock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ─── Aucun montant ne vient du navigateur ──────────────────────

/* La faille de l'audit §3.1, et la seule qui ne doit jamais se rouvrir : les
 * prix, les frais et les totaux étaient repris du corps de la requête. Un
 * panier de 80 € passait à 1 centime chez Stripe. Ces tests vérifient qu'un
 * montant envoyé par le navigateur n'a **aucun** effet — ni sur la commande
 * écrite, ni sur ce que Stripe est chargé d'encaisser. */
describe("le serveur seul fixe les montants", () => {
  it("ignore totalCents, subtotalCents, feeCents et discountCents du corps", async () => {
    const r = await commander({
      lines: [{ dishId: MAFE.id, qty: 2 }],
      totalCents: 1,
      subtotalCents: 1,
      feeCents: -500,
      discountCents: 9999,
      vatRateBp: 0,
    });

    expect(r.statut).toBe(200);
    const row = derniereCommande();
    expect(row.subtotalCents).toBe(2400);
    expect(row.totalCents).toBe(2400);
    expect(row.discountCents).toBe(0);
    expect(row.feeCents).toBe(0);
    expect(row.vatRateBp).toBe(1000);
  });

  it("ignore un prix unitaire glissé dans une ligne", async () => {
    const r = await commander({
      lines: [{ dishId: MAFE.id, qty: 1, unitPriceCents: 1, lineTotalCents: 1, price: 0.01 }],
    });
    expect(r.statut).toBe(200);
    expect(lignesFigees()[0].unitPriceCents).toBe(1200);
    expect(lignesFigees()[0].lineTotalCents).toBe(1200);
  });

  it("ignore une zone et une distance imposées par le client", async () => {
    const r = await commander({
      mode: "livraison",
      customer: { ...CLIENT, ...ADRESSE },
      lines: [{ dishId: MAFE.id, qty: 2 }],
      zoneIdx: 9,
      distanceKm: 0.1,
    });
    expect(r.statut).toBe(200);
    expect(derniereCommande().zoneIdx).toBe(0);
    expect(derniereCommande().feeCents).toBe(300);
    expect(derniereCommande().distanceKm).toBeNull();
  });

  it("facture le supplément d'option, qui n'était qu'affiché autrefois", async () => {
    const r = await commander({
      lines: [{ dishId: AVEC_OPTIONS.id, qty: 1, opts: { Poisson: "Poisson entier" } }],
    });
    expect(r.statut).toBe(200);
    expect(lignesFigees()[0].unitPriceCents).toBe(2300);
    expect(derniereCommande().totalCents).toBe(2300);
  });

  /* Ce que Stripe encaissera doit valoir exactement ce que la commande annonce.
   * Les deux sont construits séparément — lignes d'articles d'un côté, coupon
   * de remise de l'autre — et rien d'autre qu'un test ne tient le lien : un
   * écart signifierait « le client paie un montant que sa facture ne dit pas ». */
  it("envoie à Stripe exactement le total de la commande, remise comprise", async () => {
    etat.promotions = [promo({ code: "BIENVENUE", kind: "amount", value: 240 })];

    const r = await commander({
      mode: "livraison",
      customer: { ...CLIENT, ...ADRESSE },
      lines: [{ dishId: MAFE.id, qty: 2 }],
      promoCode: "bienvenue",
    });

    expect(r.statut).toBe(200);
    const row = derniereCommande();
    expect(row.subtotalCents).toBe(2400);
    expect(row.feeCents).toBe(300);
    expect(row.discountCents).toBe(240);
    expect(row.totalCents).toBe(2460);

    const [arguments_] = sessionStripe.mock.calls[0] as [
      {
        line_items: { quantity: number; price_data: { unit_amount: number } }[];
        discounts?: { coupon: string }[];
      },
    ];
    const articles = arguments_.line_items.reduce(
      (somme, item) => somme + item.price_data.unit_amount * item.quantity,
      0,
    );
    expect(articles).toBe(2700);
    expect(arguments_.discounts?.[0].coupon).toBe("remise-240");
    expect(articles - 240).toBe(row.totalCents);
  });

  it("n'attache aucun coupon quand il n'y a pas de remise", async () => {
    await commander();
    const [arguments_] = sessionStripe.mock.calls[0] as [{ discounts?: unknown }];
    expect(arguments_.discounts).toBeUndefined();
    expect(couponRecupere).not.toHaveBeenCalled();
  });

  it("refuse un code promotionnel inventé plutôt que de l'ignorer", async () => {
    const r = await commander({ promoCode: "GRATUIT100" });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/inconnu/i);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse un code déjà utilisé par ce client", async () => {
    etat.promotions = [promo({ code: "BIENVENUE", oncePerCustomer: true })];
    etat.commandesDejaPromo = 1;
    const r = await commander({ promoCode: "BIENVENUE" });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/déjà utilisé/);
  });

  it("applique seule la meilleure promotion automatique, sans code saisi", async () => {
    etat.promotions = [
      promo({ id: "promo-petite", code: null, kind: "amount", value: 100, auto: true }),
      promo({ id: "promo-grosse", code: null, kind: "amount", value: 500, auto: true }),
    ];
    const r = await commander({ lines: [{ dishId: MAFE.id, qty: 2 }] });

    expect(r.statut).toBe(200);
    expect(derniereCommande().promotionId).toBe("promo-grosse");
    expect(derniereCommande().discountCents).toBe(500);
    expect(derniereCommande().totalCents).toBe(1900);
  });

  it("annule les frais quand une promotion automatique offre la livraison", async () => {
    etat.promotions = [promo({ id: "promo-port", code: null, kind: "free_delivery", value: 0, auto: true })];
    const r = await commander({
      mode: "livraison",
      customer: { ...CLIENT, ...ADRESSE },
      lines: [{ dishId: MAFE.id, qty: 2 }],
    });

    expect(r.statut).toBe(200);
    expect(derniereCommande().feeCents).toBe(0);
    expect(derniereCommande().totalCents).toBe(2400);
  });

  it("refuse un code expiré ou épuisé", async () => {
    etat.promotions = [promo({ code: "FINI", maxUses: 3, usedCount: 3 })];
    expect((await commander({ promoCode: "FINI" })).statut).toBe(409);

    etat.promotions = [promo({ code: "VIEUX", endsAt: new Date("2026-01-01T00:00:00.000Z") })];
    const r = await commander({ promoCode: "VIEUX" });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/expiré/);
  });
});

// ─── Identité, mode et adresse ─────────────────────────────────

/* Une commande sans coordonnées exploitables est une commande perdue : le
 * restaurant n'a aucun moyen de prévenir d'un retard, et le livreur sonne dans
 * le vide. Ces refus arrivent avant toute écriture en base. */
describe("coordonnées et mode", () => {
  it("refuse un nom, un email ou un téléphone inexploitables", async () => {
    const cas: [Record<string, unknown>, RegExp][] = [
      [{ ...CLIENT, name: "A" }, /nom/i],
      [{ ...CLIENT, name: "" }, /nom/i],
      [{ ...CLIENT, email: "awa.diallo" }, /email/i],
      [{ ...CLIENT, email: "awa@diallo" }, /email/i],
      [{ ...CLIENT, phone: "06 12" }, /téléphone/i],
      [{ ...CLIENT, phone: "" }, /téléphone/i],
    ];
    for (const [customer, attendu] of cas) {
      const r = await commander({ customer });
      expect(r.statut, JSON.stringify(customer)).toBe(400);
      expect(r.corps.error).toMatch(attendu);
    }
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse un moyen de paiement hors liste", async () => {
    const r = await commander({ paymentMethod: "Bitcoin" });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/moyen de paiement/i);
  });

  /* `sur_place` n'est pas proposé sur le tunnel web : un client qui commande
   * depuis son canapé ne mange pas au restaurant, et la TVA ne serait pas la
   * bonne. Le tunnel web ne doit donc pas l'accepter, même forgé. */
  it("refuse le mode « sur place » depuis le tunnel web", async () => {
    const r = await commander({ mode: "sur_place" });
    expect(r.statut).toBe(400);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse une livraison sans adresse complète", async () => {
    const cas: Record<string, unknown>[] = [
      { ...CLIENT },
      { ...CLIENT, city: "Pontault-Combault", zip: "77340" },
      { ...CLIENT, address: "12 rue des Prés", zip: "77340" },
      { ...CLIENT, address: "12 rue des Prés", city: "Pontault-Combault" },
      { ...CLIENT, address: "12", city: "Pontault-Combault", zip: "77340" },
    ];
    for (const customer of cas) {
      const r = await commander({ mode: "livraison", customer });
      expect(r.statut, JSON.stringify(customer)).toBe(400);
    }
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse un code postal qui n'en est pas un", async () => {
    for (const zip of ["7734", "773400", "77 340", "ABCDE", "77340 "]) {
      const r = await commander({
        mode: "livraison",
        customer: { ...CLIENT, ...ADRESSE, zip },
        lines: [{ dishId: MAFE.id, qty: 2 }],
      });
      if (zip === "77340 ") {
        // Les espaces de bord sont nettoyés : celui-là est bien un code valide.
        expect(r.statut, zip).toBe(200);
        continue;
      }
      expect(r.statut, zip).toBe(400);
      expect(r.corps.error, zip).toMatch(/code postal/i);
    }
  });

  it("refuse une adresse hors zone de livraison", async () => {
    const r = await commander({
      mode: "livraison",
      customer: { ...CLIENT, address: "1 rue de Rivoli", city: "Paris", zip: "75001" },
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/ne livrons pas/);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse une livraison sous le minimum de commande de la zone", async () => {
    const r = await commander({
      mode: "livraison",
      customer: { ...CLIENT, ...ADRESSE },
      lines: [{ dishId: MAFE.id, qty: 1 }],
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/minimum de commande/);
    expect(r.corps.error).toContain("15.00");
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — le code postal n'est pas décisif.
   *
   * `resolveZone()` cherche par code postal, puis **retombe sur le nom de
   * commune** si le code ne correspond à rien. Un client qui déclare « Paris
   * 75001 » est bien refusé, mais le même client qui écrit « 75001 » avec la
   * commune « Pontault-Combault » obtient la zone 0, ses 3 € de frais et son
   * minimum de 15 € pour une livraison à 30 km. Le repli par commune a du sens
   * sur un code postal **absent** (il est facultatif ailleurs) ; sur un code
   * postal présent, bien formé et appartenant à aucune zone, il transforme une
   * donnée fiable en donnée décorative. Correction attendue dans `lib/zones.ts`
   * ou dans l'appel de `computeOrder` : un zip fourni qui ne tombe dans aucune
   * zone est un refus, pas une invitation à relire la ville. */
  it.fails("devrait refuser un code postal hors zone même si la ville est livrée", async () => {
    const r = await commander({
      mode: "livraison",
      customer: { ...CLIENT, address: "1 rue de Rivoli", city: "Pontault-Combault", zip: "75001" },
      lines: [{ dishId: MAFE.id, qty: 2 }],
    });
    expect(r.statut).toBe(409);
  });
});

// ─── Panier ────────────────────────────────────────────────────

/* Le panier est la partie la plus falsifiable de la requête : il voyage en
 * clair, il est reconstruit à chaque chargement de page, et le tunnel laisse le
 * navigateur en garder une copie. Aucune de ces lignes ne doit produire une
 * commande, et aucune ne doit produire une 500. */
describe("panier refusé", () => {
  it("refuse un panier vide ou mal formé", async () => {
    for (const lines of [[], null, "deux mafés", 3, {}]) {
      const r = await commander({ lines });
      expect(r.statut, JSON.stringify(lines)).toBe(400);
      expect(r.corps.error, JSON.stringify(lines)).toMatch(/vide/i);
    }
  });

  it("refuse un corps qui n'est pas du JSON", async () => {
    const r = await appeler<CorpsErreur>(POST, {
      chemin: "/api/checkout",
      corpsBrut: "{\"lines\": [",
    });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toBe("Requête invalide");
  });

  it("refuse les quantités absurdes", async () => {
    for (const qty of [0, -2, 1.5, 51, 1e9, "2", null]) {
      const r = await commander({ lines: [{ dishId: MAFE.id, qty }] });
      expect(r.statut, JSON.stringify(qty)).toBe(409);
      expect(r.corps.error, JSON.stringify(qty)).toMatch(/Quantité invalide/);
    }
    expect(etat.commandes).toHaveLength(0);
  });

  /* Une ligne sans `dishId` ni `formulaId` est bien refusée, mais le message
   * est celui d'un panier vide : `computeOrder()` n'ayant aucun identifiant à
   * relire, il s'arrête avant `priceLines()` et son « Ligne de panier
   * invalide ». Le client, lui, voit trois plats à l'écran et lit « Votre
   * panier est vide » — il n'a aucun moyen de comprendre quoi corriger. */
  it("refuse une ligne sans plat ni formule, mais l'explique mal", async () => {
    const r = await commander({ lines: [{ qty: 1 }] });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toBe("Votre panier est vide");
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse une ligne valide mêlée à une ligne sans plat", async () => {
    const r = await commander({
      lines: [{ dishId: MAFE.id, qty: 1 }, { qty: 2 }],
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Ligne de panier invalide/);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse un plat qui n'est plus à la carte", async () => {
    const r = await commander({ lines: [{ dishId: "plat-supprime", qty: 1 }] });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/n'existe plus/);
  });

  it("refuse un plat rendu indisponible depuis l'admin", async () => {
    etat.plats = [plat({ available: false })];
    const r = await commander();
    expect(r.statut).toBe(409);
    expect(r.corps.error).toContain("Mafé Bœuf");
  });

  it("refuse un plat épuisé et dit ce qu'il reste", async () => {
    etat.plats = [plat({ stock: 0 })];
    expect((await commander()).corps.error).toMatch(/épuisé/);

    etat.plats = [plat({ stock: 2 })];
    const r = await commander({ lines: [{ dishId: MAFE.id, qty: 4 }] });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Il ne reste que 2/);
  });

  it("cumule les lignes d'un même plat avant de regarder le stock", async () => {
    etat.plats = [plat({ stock: 3 })];
    const r = await commander({
      lines: [
        { dishId: MAFE.id, qty: 2 },
        { dishId: MAFE.id, qty: 2, note: "bien épicé" },
      ],
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Il ne reste que 3/);
  });

  it("refuse un plat dont le prix n'est pas encore fixé", async () => {
    etat.plats = [plat({ priceCents: null, badge: "Bientôt" })];
    const r = await commander();
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/pas encore défini/);
  });

  it("exige les options obligatoires et refuse un choix inventé", async () => {
    const sansChoix = await commander({ lines: [{ dishId: AVEC_OPTIONS.id, qty: 1 }] });
    expect(sansChoix.statut).toBe(409);
    expect(sansChoix.corps.error).toMatch(/Choisissez « Poisson »/);

    const mauvaisChoix = await commander({
      lines: [{ dishId: AVEC_OPTIONS.id, qty: 1, opts: { Poisson: "Caviar" } }],
    });
    expect(mauvaisChoix.statut).toBe(409);
    expect(mauvaisChoix.corps.error).toMatch(/invalide/);
  });

  it("borne un panier à soixante lignes", async () => {
    const lines = Array.from({ length: 61 }, () => ({ dishId: MAFE.id, qty: 1 }));
    const r = await commander({ lines });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Trop d'articles/);
  });

  it("tronque une note démesurée au lieu de la stocker telle quelle", async () => {
    await commander({ lines: [{ dishId: MAFE.id, qty: 1, note: "a".repeat(5000) }] });
    expect(lignesFigees()[0].note).toHaveLength(300);
  });
});

// ─── Horaires ──────────────────────────────────────────────────

/* Les horaires étaient décoratifs : une commande pouvait être passée et payée à
 * 4 h du matin, pour un restaurant fermé. Le refus doit arriver côté serveur —
 * le client peut toujours forger un créneau — et il doit dire quand on rouvre,
 * sinon il ne reste au client qu'à partir ailleurs. */
describe("horaires de service", () => {
  it("accepte « dès que possible » pendant le service", async () => {
    const r = await commander({ slot: "asap" });
    expect(r.statut).toBe(200);
    expect(derniereCommande().slot).toBe("asap");
  });

  it("accepte un créneau réellement proposé aujourd'hui", async () => {
    const r = await commander({ slot: "20:30" });
    expect(r.statut).toBe(200);
    expect(derniereCommande().slot).toBe("20:30");
  });

  it("refuse un créneau déjà passé ou hors service", async () => {
    for (const slot of ["12:00", "18:00", "23:30", "07:00"]) {
      const r = await commander({ slot });
      expect(r.statut, slot).toBe(409);
      expect(r.corps.error, slot).toMatch(/fermés/i);
    }
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse hors service en nommant le prochain service", async () => {
    vi.setSystemTime(HORS_SERVICE);
    const r = await commander({ slot: "asap" });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toContain("Nous sommes fermés");
    expect(r.corps.error).toContain("Mercredi");
    expect(r.corps.error).toContain("18:00");
    expect(etat.commandes).toHaveLength(0);
  });

  /* `"next"` veut dire « rien ne m'est proposé aujourd'hui, prenez-la pour le
   * prochain service ». Tant qu'il reste des créneaux du jour, l'accepter
   * laisserait un client sauter la file du soir. */
  it("refuse « prochain service » tant qu'il reste des créneaux aujourd'hui", async () => {
    const r = await commander({ slot: "next" });
    expect(r.statut).toBe(409);
  });

  it("accepte « prochain service » après la dernière commande du jour et le résout en horaire lisible", async () => {
    // Mercredi 22:40 à Paris : plus aucun créneau ce soir.
    vi.setSystemTime(new Date("2026-10-14T20:40:00.000Z"));
    const r = await commander({ slot: "next" });
    expect(r.statut).toBe(200);
    expect(derniereCommande().slot).toBe("Jeudi 11:30");
  });

  it("refuse un créneau trop long pour être un horaire", async () => {
    const r = await commander({ slot: "20:30 ou 21:00" });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toMatch(/créneau/i);
  });
});

// ─── Plats sur commande ────────────────────────────────────────

/* Un gigot engage un achat chez le boucher plusieurs jours à l'avance. Deux
 * garde-fous, et les deux se forgent depuis le navigateur : la date de retrait
 * doit respecter le délai du plat, et le règlement doit être encaissé en ligne.
 * Un agneau entier sorti pour un client qui ne vient pas, c'est la marge du
 * service. */
describe("plat sur commande", () => {
  const panierGigot = [{ dishId: GIGOT.id, qty: 1 }];

  it("exige une date de retrait", async () => {
    const r = await commander({ lines: panierGigot, slot: "asap" });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/date de retrait/);
    expect(etat.commandes).toHaveLength(0);
  });

  it("refuse une date plus proche que le délai du plat et indique la première possible", async () => {
    const r = await commander({
      lines: panierGigot,
      slot: "19:30",
      scheduledDate: "2026-10-15",
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/vendredi 16 octobre/);
  });

  it("refuse une date dans le passé", async () => {
    const r = await commander({
      lines: panierGigot,
      slot: "19:30",
      scheduledDate: "2026-01-05",
    });
    expect(r.statut).toBe(409);
  });

  it("refuse une heure où le restaurant ne sert pas ce jour-là", async () => {
    const r = await commander({
      lines: panierGigot,
      slot: "12:30",
      scheduledDate: "2026-10-16",
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/Nous ne servons pas à 12:30/);
  });

  it("refuse les espèces : un plat sur commande se règle en ligne", async () => {
    const r = await commander({
      lines: panierGigot,
      slot: "19:30",
      scheduledDate: "2026-10-16",
      paymentMethod: "Espèces sur place",
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/en ligne/);
    expect(etat.commandes).toHaveLength(0);
  });

  it("accepte une réservation payée par carte et fige la date demandée", async () => {
    const r = await commander({
      lines: panierGigot,
      slot: "19:30",
      scheduledDate: "2026-10-16",
    });
    expect(r.statut).toBe(200);
    const row = derniereCommande();
    expect(row.preorder).toBe(true);
    expect(row.slot).toBe("19:30");
    expect(row.status).toBe("en_attente_paiement");
    expect((row.scheduledFor as Date).toISOString()).toBe("2026-10-16T17:30:00.000Z");
  });

  it("prend le délai du plat le plus lent du panier", async () => {
    const r = await commander({
      lines: [
        { dishId: MAFE.id, qty: 1 },
        { dishId: GIGOT.id, qty: 1 },
      ],
      slot: "asap",
    });
    expect(r.statut).toBe(409);
    expect(r.corps.error).toMatch(/date de retrait/);
  });
});

// ─── Statut initial et paiement ────────────────────────────────

/* Le statut initial est la frontière entre « la cuisine s'y met » et « on
 * attend l'argent ». L'inverser dans un sens prépare des commandes jamais
 * payées, dans l'autre laisse un client qui a payé attendre que sa commande
 * démarre. */
describe("statut et paiement", () => {
  it("confirme immédiatement une commande en espèces et envoie la confirmation", async () => {
    const r = await commander({ paymentMethod: "Espèces sur place" });

    expect(r.statut).toBe(200);
    const row = derniereCommande();
    expect(row.status).toBe("confirmee");
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(row.paid).toBe(false);
    expect(row.paymentStatus).toBe("en_attente");
    expect(r.corps.url).toBe(`https://o3saveurs.fr/commande/${r.corps.orderId}`);
    expect(envoiConfirmation).toHaveBeenCalledTimes(1);
    expect(sessionStripe).not.toHaveBeenCalled();
  });

  it("laisse une commande par carte en attente de paiement", async () => {
    const r = await commander({ paymentMethod: "Carte bancaire" });

    expect(r.statut).toBe(200);
    const row = derniereCommande();
    expect(row.status).toBe("en_attente_paiement");
    expect(row.confirmedAt).toBeNull();
    expect(row.paid).toBe(false);
    expect(r.corps.url).toBe("https://checkout.stripe.com/c/cs_test_1");
    expect(envoiConfirmation).not.toHaveBeenCalled();
  });

  it("mémorise la session Stripe sur la commande, pour que le webhook la retrouve", async () => {
    await commander();
    expect(etat.majCommandes.at(-1)?.data.stripeSessionId).toBe("cs_test_1");
    const [arguments_] = sessionStripe.mock.calls[0] as [{ metadata: { orderId: string } }];
    expect(arguments_.metadata.orderId).toBe("cmd-1");
  });

  it("réserve le stock dès la création, avant toute redirection", async () => {
    await commander({ lines: [{ dishId: MAFE.id, qty: 2 }] });
    expect(reserveStock).toHaveBeenCalledTimes(1);
    const [lignes, options] = reserveStock.mock.calls[0] as [
      { dishId: string; qty: number }[],
      { orderId: string },
    ];
    expect(lignes[0]).toMatchObject({ dishId: MAFE.id, qty: 2 });
    expect(options.orderId).toBe("cmd-1");
  });

  /* Deux clients sur le dernier thiéboudiène : celui qui perd la course ne doit
   * pas laisser derrière lui une commande que la cuisine verra passer. */
  it("supprime la commande quand le stock est parti entre-temps", async () => {
    reserveStock.mockResolvedValue({
      ok: false,
      shortages: [{ dishId: MAFE.id, name: "Mafé Bœuf", requested: 2, available: 1 }],
    });
    const r = await commander({ lines: [{ dishId: MAFE.id, qty: 2 }] });

    expect(r.statut).toBe(409);
    expect(r.corps.error).toContain("1 restant");
    expect(etat.supprimees).toEqual(["cmd-1"]);
    expect(sessionStripe).not.toHaveBeenCalled();
  });

  /* Stripe injoignable : la commande n'est **pas** supprimée, parce que la
   * session peut avoir été créée malgré le timeout et le client peut payer.
   * Elle est marquée en échec et sort du back-office opérationnel, et le stock
   * repart en rayon. */
  it("marque la commande en échec et rend le stock si Stripe ne répond pas", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sessionStripe.mockRejectedValue(new Error("timeout"));

    const r = await commander();

    expect(r.statut).toBe(502);
    expect(r.corps.error).toMatch(/Paiement indisponible/);
    expect(etat.supprimees).toHaveLength(0);
    expect(etat.majCommandes.at(-1)?.data).toMatchObject({
      status: "annulee",
      paymentStatus: "echec",
    });
    expect(releaseStock).toHaveBeenCalledTimes(1);
    journal.mockRestore();
  });

  /* Sans clé Stripe, le repli « on marque payé » rend toutes les commandes
   * gratuites. Tolérable en développement, jamais en production. */
  it("refuse le paiement en ligne plutôt que d'offrir la commande si la clé Stripe manque en production", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    etat.stripePret = false;

    const r = await commander();

    expect(r.statut).toBe(503);
    expect(etat.commandes).toHaveLength(0);
    journal.mockRestore();
  });

  /* Mode démo : sans clé Stripe et hors production, la commande est marquée
   * payée sans qu'un centime ne circule. C'est ce qui permet de développer le
   * tunnel, et c'est aussi pourquoi le garde `NODE_ENV === "production"`
   * ci-dessus n'est pas négociable — un déploiement sans la clé offrirait la
   * carte entière. */
  it("marque payé sans encaisser en mode démo, hors production", async () => {
    etat.stripePret = false;
    const r = await commander();

    expect(r.statut).toBe(200);
    expect(r.corps.demo).toBe(true);
    expect(etat.majCommandes.at(-1)?.data).toMatchObject({
      paid: true,
      paymentStatus: "paye",
      status: "confirmee",
    });
    expect(envoiConfirmation).toHaveBeenCalledTimes(1);
  });

  it("laisse une réservation en attente de validation même payée en démo", async () => {
    etat.stripePret = false;
    await commander({
      lines: [{ dishId: GIGOT.id, qty: 1 }],
      slot: "19:30",
      scheduledDate: "2026-10-16",
    });
    expect(etat.majCommandes.at(-1)?.data).toMatchObject({
      paid: true,
      status: "en_attente_validation",
      confirmedAt: null,
    });
  });

  it("limite le débit : la treizième commande d'une même adresse attend", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < LIMITS.checkout.limit; i++) {
      expect((await commander({}, ip)).statut).toBe(200);
    }
    const refus = await commander({}, ip);
    expect(refus.statut).toBe(429);
    expect(refus.entetes.get("Retry-After")).toBeTruthy();
    expect(refus.corps.error).toMatch(/Trop de commandes/);
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — la limite de débit se contourne avec un en-tête.
   *
   * `clientKey()` retient la **première** valeur de `x-forwarded-for`. Or un
   * proxy *ajoute* son maillon à la fin de cet en-tête : la première valeur est
   * donc celle que l'appelant a écrite lui-même, et il suffit de la faire
   * tourner pour obtenir un seau neuf à chaque requête. La limite existe pour
   * une raison précise — chaque commande déclenche un envoi Resend, et une
   * boucle épuise le quota puis fait blacklister le domaine expéditeur du
   * restaurant. Il faut lire le dernier maillon ajouté par la plateforme (ou
   * l'en-tête propre à l'hébergeur), pas le premier. Le commentaire de
   * `lib/rateLimit.ts` parle encore de Vercel ; le site tourne sur Clever
   * Cloud, dont le proxy ajoute aussi son maillon en queue. */
  it.fails("devrait compter les commandes d'un même appelant malgré un en-tête forgé", async () => {
    const forger = (n: number) =>
      appeler<CorpsCheckout>(POST, {
        chemin: "/api/checkout",
        corps: corps(),
        entetes: { "x-forwarded-for": `198.51.100.${n}, 203.0.113.9` },
      });

    for (let i = 0; i < LIMITS.checkout.limit; i++) {
      expect((await forger(i)).statut).toBe(200);
    }
    expect((await forger(99)).statut).toBe(429);
  });
});

// ─── Rattachement au compte ────────────────────────────────────

/* Une commande rattachée au compte apparaît dans « Mes commandes » et fonde la
 * relance, la fidélité et le SAV. Le rattachement se fait sur l'identifiant du
 * compte connecté, pas sur l'email saisi : on commande très bien pour un
 * collègue depuis son propre compte. */
describe("compte connecté", () => {
  it("rattache la commande au compte connecté", async () => {
    enClient();
    etat.comptes = [{ id: "usr-1", email: EMAIL_CLIENT }];

    await commander({ customer: { ...CLIENT, email: "autre.adresse@example.fr" } });

    expect(derniereCommande().userId).toBe("usr-1");
    expect(derniereCommande().customerEmail).toBe("autre.adresse@example.fr");
  });

  it("laisse passer une commande en invité", async () => {
    anonyme();
    const r = await commander();
    expect(r.statut).toBe(200);
    expect(derniereCommande().userId).toBeNull();
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — le rattachement est sensible à la casse.
   *
   * `auth.ts` crée la ligne `User` avec `email.toLowerCase()`, mais
   * `resolveUserId()` interroge `findUnique({ email })` avec l'email **brut**
   * de la session. Auth0 ne garantit pas la casse du claim `email` (elle suit
   * ce qu'a tapé le client à l'inscription, ou ce que renvoie le fournisseur
   * social). Pour un compte dont l'email arrive capitalisé, aucune commande
   * n'est jamais rattachée : « Mes commandes » reste vide, les relances de
   * panier et l'historique de fidélité ne voient rien, et personne ne s'en
   * aperçoit — la commande est bien créée. Un `.toLowerCase()` dans
   * `resolveUserId()` suffit ; `GET /api/orders/[id]` compare déjà les emails
   * en minuscules, c'est la même règle. */
  it.fails("devrait rattacher la commande même si la session porte un email capitalisé", async () => {
    enClient({ email: "Awa.Diallo@Example.FR" });
    etat.comptes = [{ id: "usr-1", email: EMAIL_CLIENT }];

    await commander({ customer: { ...CLIENT, email: EMAIL_CLIENT } });

    expect(derniereCommande().userId).toBe("usr-1");
  });
});

// ─── Réglages sans effet ───────────────────────────────────────

/* Trois réglages de l'écran Réglages promettent un contrôle que la route
 * n'exerce pas. Un réglage qui ne fait rien est plus dangereux qu'un réglage
 * absent : la cliente le décoche, lit « enregistré », et croit la vente
 * fermée. */
describe("réglages que le checkout n'applique pas", () => {
  /* ⚠️ DÉFAUT DE PRODUCTION — « Accepter le paiement en espèces » est décoratif.
   *
   * `order.acceptCash` n'est lu que par `lib/pageContent.ts` (le texte de la
   * page) et `lib/seoData.ts` (le balisage `acceptsCash` de la fiche Google).
   * Décoché, le site annonce donc partout que les espèces ne sont pas
   * acceptées — et `/api/checkout` continue de créer des commandes
   * « Espèces sur place », confirmées et entrées en cuisine, que personne
   * n'attend à la caisse. Même remarque pour `order.acceptCard`. */
  it.fails("devrait refuser les espèces quand les Réglages les désactivent", async () => {
    etat.reglages["order.acceptCash"] = "false";
    const r = await commander({ paymentMethod: "Espèces sur place" });
    expect(r.statut).toBeGreaterThanOrEqual(400);
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — « commandes max par créneau » ne plafonne rien.
   *
   * `order.slotCapacity` est lu par `getSlotConfig()`, affiché dans les
   * Réglages… et utilisé nulle part : ni `/api/checkout`, ni `/api/slots` ne
   * comptent les commandes déjà posées sur un créneau. Le créneau de 20:00
   * accepte donc cent commandes, la cuisine en sort huit, et les
   * quatre-vingt-douze autres sont en retard dès leur confirmation. C'est le
   * réglage qui sépare un coup de feu tenable d'un service perdu. */
  it.fails("devrait refuser une commande sur un créneau déjà complet", async () => {
    etat.reglages["order.slotCapacity"] = "1";
    etat.commandesDejaPromo = 50; // 50 commandes déjà posées sur ce créneau
    const r = await commander({ slot: "20:30" });
    expect(r.statut).toBe(409);
  });

  /* ⚠️ DÉFAUT DE PRODUCTION — `usedCount` n'est jamais incrémenté hors Stripe.
   *
   * Le compteur d'utilisations d'un code promotionnel est incrémenté par le
   * seul webhook Stripe (`app/api/webhooks/stripe/route.ts:152`). Une commande
   * en espèces porte bien le code et la remise, mais ne le compte pas : un code
   * `maxUses: 1` — un geste commercial, un dédommagement SAV, une opération
   * « 50 premiers » — se réutilise indéfiniment en choisissant « Espèces sur
   * place ». `oncePerCustomer` tient encore (il compte les commandes), pas
   * `maxUses`. Même trou pour la borne en salle, qui applique les promotions
   * automatiques sans jamais les compter. */
  it.fails("devrait compter l'usage d'un code promotionnel réglé en espèces", async () => {
    etat.promotions = [promo({ code: "DESOLEE", maxUses: 1, usedCount: 0 })];
    const r = await commander({
      lines: [{ dishId: MAFE.id, qty: 2 }],
      promoCode: "DESOLEE",
      paymentMethod: "Espèces sur place",
    });

    expect(r.statut).toBe(200);
    expect(derniereCommande().promoCode).toBe("DESOLEE");
    expect(etat.promotionsIncrementees).toEqual(["promo-1"]);
  });
});
