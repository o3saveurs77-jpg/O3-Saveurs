import { describe, expect, it, vi } from "vitest";

/* `lib/pricing.ts` importe `lib/prisma` pour `computeOrder()`. Tout ce qui est
 * testé ici est pur : on neutralise le client Prisma. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { vatBreakdown, vatBreakdownByRate, fmtVatRate, VAT_RATE_BP } from "@/lib/money";
import { vatPartsOf } from "@/lib/types";
import { priceLines } from "@/lib/pricing";
import type { Dish, Formula } from "@/lib/menu";
import type { OrderLine } from "@/lib/types";

const TAUX_PLAT = 1000;
const TAUX_BOISSON = 550;

function dish(over: Partial<Dish> = {}): Dish {
  return {
    id: "d1",
    cat: "africaine",
    name: "Mafé Bœuf",
    desc: "",
    priceCents: 1200,
    badge: null,
    photo: null,
    options: [],
    tags: [],
    spice: 0,
    popular: false,
    available: true,
    allergens: [],
    stock: null,
    stockAlert: null,
    costCents: null,
    position: 0,
    leadTimeHours: 0,
    vatRateBp: TAUX_PLAT,
    ...over,
  };
}

const somme = (buckets: { grossCents: number }[]) =>
  buckets.reduce((s, b) => s + b.grossCents, 0);

// ─── Ventilation d'un montant ──────────────────────────

describe("vatBreakdownByRate", () => {
  it("ventile un panier à taux unique comme l'ancien calcul", () => {
    const [b] = vatBreakdownByRate([[TAUX_PLAT, 1100]]);
    const ancien = vatBreakdown(1100, TAUX_PLAT);
    expect(b.netCents).toBe(ancien.netCents);
    expect(b.vatCents).toBe(ancien.vatCents);
  });

  /* Le cœur du sujet : une canette à 5,5 % ne doit pas être taxée à 10 % parce
     qu'elle voyage avec un plat. */
  it("sépare les taux d'un panier mixte", () => {
    const buckets = vatBreakdownByRate([
      [TAUX_PLAT, 1200],
      [TAUX_BOISSON, 200],
    ]);
    expect(buckets.map((b) => b.rateBp)).toEqual([TAUX_BOISSON, TAUX_PLAT]);
    expect(buckets.find((b) => b.rateBp === TAUX_BOISSON)!.grossCents).toBe(200);
    expect(buckets.find((b) => b.rateBp === TAUX_PLAT)!.grossCents).toBe(1200);
  });

  it("regroupe deux lignes de même taux", () => {
    const buckets = vatBreakdownByRate([
      [TAUX_PLAT, 500],
      [TAUX_PLAT, 700],
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].grossCents).toBe(1200);
  });

  /* Frais de livraison et remise n'ont pas de taux propre : ils suivent le sort
     de ce qu'ils accompagnent, donc se ventilent au prorata. Les mettre en bloc
     au taux normal ferait payer 10 % sur la livraison d'un panier de boissons. */
  it("ventile les frais de livraison au prorata des articles", () => {
    const buckets = vatBreakdownByRate(
      [
        [TAUX_PLAT, 900],
        [TAUX_BOISSON, 100],
      ],
      { feeCents: 300 },
    );
    expect(somme(buckets)).toBe(1300);
    expect(buckets.find((b) => b.rateBp === TAUX_BOISSON)!.grossCents).toBe(130);
    expect(buckets.find((b) => b.rateBp === TAUX_PLAT)!.grossCents).toBe(1170);
  });

  it("ventile la remise au prorata des articles", () => {
    const buckets = vatBreakdownByRate(
      [
        [TAUX_PLAT, 900],
        [TAUX_BOISSON, 100],
      ],
      { discountCents: 200 },
    );
    expect(somme(buckets)).toBe(800);
  });

  /* Une facture dont les lignes ne somment pas au total est un document faux :
     l'écart d'arrondi doit toujours atterrir quelque part. */
  it("somme toujours exactement au total, arrondis compris", () => {
    for (const total of [1, 3, 7, 13, 99, 101, 333, 1237, 9999]) {
      const buckets = vatBreakdownByRate(
        [
          [TAUX_PLAT, Math.ceil(total / 3)],
          [TAUX_BOISSON, total - Math.ceil(total / 3)],
        ],
        { feeCents: 250 },
      );
      expect(somme(buckets)).toBe(total + 250);
    }
  });

  it("le HT et la TVA d'un seau se recomposent en TTC", () => {
    for (const b of vatBreakdownByRate([[TAUX_PLAT, 1234], [TAUX_BOISSON, 567]])) {
      expect(b.netCents + b.vatCents).toBe(b.grossCents);
    }
  });

  it("ne renvoie rien pour un panier vide", () => {
    expect(vatBreakdownByRate([])).toEqual([]);
    expect(vatBreakdownByRate([[TAUX_PLAT, 0]])).toEqual([]);
  });

  it("une remise supérieure au panier ne produit pas de base négative", () => {
    const buckets = vatBreakdownByRate([[TAUX_PLAT, 500]], { discountCents: 900 });
    expect(somme(buckets)).toBe(0);
  });
});

// ─── Ventilation figée sur les lignes ──────────────────

describe("priceLines — ventilation figée", () => {
  it("un plat à la carte porte son propre taux", () => {
    const canette = dish({ id: "d9", cat: "boissons", priceCents: 200, vatRateBp: TAUX_BOISSON });
    const res = priceLines([canette], [{ dishId: "d9", qty: 2 }]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value[0].vatSplit).toEqual([[TAUX_BOISSON, 400]]);
  });

  /* Une formule « plat + boisson » vend deux taux sous un prix unique. La
     ventiler au prorata des prix de carte répartit la remise implicite de la
     formule proportionnellement, au lieu de la loger sur le taux qui
     arrangerait. */
  it("ventile une formule au prorata des plats retenus", () => {
    const plat = dish({ id: "d1", priceCents: 1200, vatRateBp: TAUX_PLAT });
    const boisson = dish({ id: "d3", cat: "boissons", priceCents: 300, vatRateBp: TAUX_BOISSON });

    const formule: Formula = {
      id: "f1",
      code: "F1",
      name: "Express",
      desc: "",
      extra: "",
      priceCents: 1200,
      active: true,
      position: 0,
      slots: [
        {
          id: "s1",
          label: "Votre plat",
          required: true,
          position: 0,
          choices: [{ id: "c1", dishId: "d1", supplementCents: 0, position: 0 }],
        },
        {
          id: "s2",
          label: "Votre boisson",
          required: true,
          position: 1,
          choices: [{ id: "c2", dishId: "d3", supplementCents: 0, position: 0 }],
        },
      ],
    };

    const res = priceLines(
      [plat, boisson],
      [
        {
          formulaId: "f1",
          qty: 1,
          picks: [
            { slotId: "s1", dishId: "d1" },
            { slotId: "s2", dishId: "d3" },
          ],
        },
      ],
      [formule],
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const split = res.value[0].vatSplit!;

    // Valeurs de carte : 12,00 € et 3,00 € → 80 % / 20 % de 12,00 €.
    expect(new Map(split).get(TAUX_PLAT)).toBe(960);
    expect(new Map(split).get(TAUX_BOISSON)).toBe(240);
    // La ventilation somme exactement au total de la ligne.
    expect(split.reduce((s, [, c]) => s + c, 0)).toBe(res.value[0].lineTotalCents);
  });
});

// ─── Commandes antérieures ─────────────────────────────

describe("vatPartsOf", () => {
  const ligne = (over: Partial<OrderLine> = {}): OrderLine => ({
    dishId: "d1",
    name: "Mafé",
    photo: null,
    unitPriceCents: 1200,
    qty: 1,
    lineTotalCents: 1200,
    opts: {},
    formule: null,
    note: "",
    ...over,
  });

  /* Une facture émise ne se recalcule pas : une commande passée avant la
     ventilation multi-taux doit continuer à porter le taux unique sous lequel
     elle a été facturée, quoi qu'il advienne de la carte ensuite. */
  it("retombe sur le taux de la commande quand les lignes n'en portent pas", () => {
    const parts = vatPartsOf({
      lines: [ligne(), ligne({ lineTotalCents: 300 })],
      vatRateBp: TAUX_PLAT,
      totalCents: 1750,
      feeCents: 250,
      discountCents: 0,
    });
    // Le total facturé fait foi : la remise et les frais s'y trouvaient déjà.
    expect(parts).toEqual([[TAUX_PLAT, 1750]]);
  });

  it("utilise la ventilation des lignes dès qu'elle existe", () => {
    const parts = vatPartsOf({
      lines: [
        ligne({ vatSplit: [[TAUX_PLAT, 1200]] }),
        ligne({ lineTotalCents: 300, vatSplit: [[TAUX_BOISSON, 300]] }),
      ],
      vatRateBp: TAUX_PLAT,
      totalCents: 1750,
      feeCents: 250,
      discountCents: 0,
    });
    expect(parts).toEqual([
      [TAUX_PLAT, 1200],
      [TAUX_BOISSON, 300],
    ]);
  });
});

describe("fmtVatRate", () => {
  it("affiche les taux français tels qu'on les écrit", () => {
    expect(fmtVatRate(VAT_RATE_BP)).toBe("10 %");
    expect(fmtVatRate(550)).toBe("5,5 %");
    expect(fmtVatRate(2000)).toBe("20 %");
  });
});
