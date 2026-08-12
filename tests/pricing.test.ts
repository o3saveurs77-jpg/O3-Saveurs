import { describe, expect, it, vi } from "vitest";

/* `lib/pricing.ts` importe `lib/prisma` pour `computeOrder()`. Les fonctions
 * testées ici sont pures : on neutralise le client Prisma afin qu'aucune
 * connexion ne soit tentée et que le test reste utilisable sans base. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  priceLines,
  promotionDiscount,
  promotionEligible,
  subtotalOf,
  unitPriceOf,
  type RawLine,
} from "@/lib/pricing";
import type { Dish } from "@/lib/menu";

// ─── Fabriques ─────────────────────────────────────────

function dish(over: Partial<Dish> = {}): Dish {
  return {
    id: "d1",
    cat: "africaine",
    name: "Mafé Bœuf",
    desc: "Bœuf mijoté, sauce arachide",
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
    vatRateBp: 1000,
    ...over,
  };
}

function line(over: Partial<RawLine> = {}): RawLine {
  return { dishId: "d1", qty: 1, ...over };
}

/** Même forme que la ligne `Promotion` lue en base. */
interface Promo {
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

function promo(over: Partial<Promo> = {}): Promo {
  return {
    id: "p1",
    code: "BIENVENUE",
    label: "Bienvenue",
    kind: "percent",
    value: 10,
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

/** Déballe un `Result` en échouant explicitement si l'appel a été refusé. */
function value<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`refus inattendu : ${r.error}`);
  return r.value;
}

const SAUCE = {
  name: "Sauce",
  required: true,
  choices: [{ l: "Nature" }, { l: "Piment maison", priceCents: 100 }],
};

const EXTRA = {
  name: "Extra",
  required: false,
  choices: [{ l: "Sans" }, { l: "Œuf", priceCents: 150 }],
};

// ─── unitPriceOf ───────────────────────────────────────

describe("unitPriceOf", () => {
  it("renvoie le prix de base quand il n'y a ni formule ni option", () => {
    expect(value(unitPriceOf(dish(), line()))).toBe(1200);
  });

  it("ajoute les suppléments des options choisies", () => {
    // Bug d'origine : « +1,00 € » était affiché dans la fiche plat mais jamais
    // ajouté au prix, l'écran annonçait donc moins que le montant facturé.
    const d = dish({ options: [SAUCE, EXTRA] });
    const l = line({ opts: { Sauce: "Piment maison", Extra: "Œuf" } });
    expect(value(unitPriceOf(d, l))).toBe(1200 + 100 + 150);
  });

  it("n'ajoute rien pour un choix sans supplément", () => {
    const d = dish({ options: [SAUCE] });
    expect(value(unitPriceOf(d, line({ opts: { Sauce: "Nature" } })))).toBe(1200);
  });

  it("ignore une option facultative non renseignée", () => {
    const d = dish({ options: [EXTRA] });
    expect(value(unitPriceOf(d, line({ opts: {} })))).toBe(1200);
  });

  it("le prix de la formule remplace le prix de base", () => {
    const d = dish({
      priceCents: 650,
      formules: [
        ["Seul", 650],
        ["+ Frites", 750],
        ["+ Frites + Boisson", 850],
      ],
    });
    const priced = value(unitPriceOf(d, line({ formule: "+ Frites + Boisson" })));
    expect(priced).toBe(850);
    expect(priced).not.toBe(650 + 850); // ni cumul, ni prix de base
  });

  it("cumule le prix de formule et les suppléments d'options", () => {
    const d = dish({
      priceCents: 650,
      formules: [
        ["Seul", 650],
        ["+ Frites", 750],
      ],
      options: [SAUCE],
    });
    const l = line({ formule: "+ Frites", opts: { Sauce: "Piment maison" } });
    expect(value(unitPriceOf(d, l))).toBe(750 + 100);
  });

  it("refuse une commande sans formule alors que le plat en propose", () => {
    const d = dish({ formules: [["Seul", 650]] });
    expect(unitPriceOf(d, line())).toMatchObject({ ok: false });
  });

  it("refuse une formule inconnue", () => {
    const d = dish({ formules: [["Seul", 650]] });
    expect(unitPriceOf(d, line({ formule: "+ Caviar" }))).toMatchObject({ ok: false });
  });

  it("refuse une option requise non renseignée", () => {
    const d = dish({ options: [SAUCE] });
    expect(unitPriceOf(d, line({ opts: {} }))).toMatchObject({ ok: false });
  });

  it("refuse un choix qui n'existe pas dans l'option", () => {
    const d = dish({ options: [SAUCE] });
    const res = unitPriceOf(d, line({ opts: { Sauce: "Truffe blanche" } }));
    expect(res.ok).toBe(false);
  });

  it("refuse un plat dont le prix n'est pas défini", () => {
    expect(unitPriceOf(dish({ priceCents: null }), line())).toMatchObject({ ok: false });
  });
});

// ─── priceLines ────────────────────────────────────────

describe("priceLines", () => {
  it("valorise les lignes et fige le total de chacune", () => {
    const d = dish({ priceCents: 399 });
    const lines = value(priceLines([d], [line({ qty: 3 })]));
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPriceCents).toBe(399);
    // 3 × 3,99 € en flottant donnerait 11.969999999999999
    expect(lines[0].lineTotalCents).toBe(1197);
  });

  it("refuse un panier vide", () => {
    expect(priceLines([dish()], [])).toMatchObject({ ok: false, error: "Votre panier est vide" });
  });

  it("refuse une quantité négative, nulle ou non entière", () => {
    const d = dish();
    for (const qty of [-1, 0, 1.5, Number.NaN]) {
      expect(priceLines([d], [line({ qty })])).toMatchObject({
        ok: false,
        error: "Quantité invalide",
      });
    }
  });

  it("plafonne la quantité par ligne", () => {
    expect(priceLines([dish()], [line({ qty: 51 })])).toMatchObject({ ok: false });
  });

  it("refuse un plat qui n'existe plus au catalogue", () => {
    expect(priceLines([dish()], [line({ dishId: "inconnu" })])).toMatchObject({ ok: false });
  });

  it("refuse un plat rendu indisponible", () => {
    expect(priceLines([dish({ available: false })], [line()])).toMatchObject({ ok: false });
  });

  it("refuse un plat épuisé", () => {
    const res = priceLines([dish({ stock: 0 })], [line()]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("épuisé");
  });

  it("refuse une quantité supérieure au stock restant", () => {
    const res = priceLines([dish({ stock: 2 })], [line({ qty: 3 })]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("2");
  });

  it("cumule le stock demandé sur deux lignes du même plat", () => {
    const d = dish({ stock: 3, options: [SAUCE] });
    const res = priceLines(d ? [d] : [], [
      line({ qty: 2, opts: { Sauce: "Nature" } }),
      line({ qty: 2, opts: { Sauce: "Piment maison" } }),
    ]);
    expect(res.ok).toBe(false);
  });

  it("accepte un stock illimité", () => {
    const lines = value(priceLines([dish({ stock: null })], [line({ qty: 50 })]));
    expect(lines[0].qty).toBe(50);
  });

  it("borne la longueur de la note du client", () => {
    const lines = value(priceLines([dish()], [line({ note: "x".repeat(500) })]));
    expect(lines[0].note).toHaveLength(300);
  });
});

// ─── subtotalOf ────────────────────────────────────────

describe("subtotalOf", () => {
  it("somme les totaux de ligne, sans dérive de centime", () => {
    const d = dish({ priceCents: 399 });
    const lines = value(priceLines([d], [line({ qty: 3 }), line({ qty: 2, note: "sans piment" })]));
    expect(subtotalOf(lines)).toBe(1197 + 798);
    expect(Number.isInteger(subtotalOf(lines))).toBe(true);
  });

  it("vaut zéro sur un panier sans ligne", () => {
    expect(subtotalOf([])).toBe(0);
  });
});

// ─── promotionEligible ─────────────────────────────────

describe("promotionEligible", () => {
  const at = new Date(2026, 6, 25, 12, 0, 0); // 25 juillet 2026, midi

  it("accepte un code actif sans contrainte", () => {
    expect(promotionEligible(promo(), 3000, at).ok).toBe(true);
  });

  it("refuse un code désactivé", () => {
    expect(promotionEligible(promo({ active: false }), 3000, at)).toMatchObject({ ok: false });
  });

  it("refuse un code pas encore valable", () => {
    const p = promo({ startsAt: new Date(2026, 7, 1) });
    expect(promotionEligible(p, 3000, at)).toMatchObject({ ok: false });
  });

  it("refuse un code expiré", () => {
    const p = promo({ endsAt: new Date(2026, 5, 30) });
    const res = promotionEligible(p, 3000, at);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("expiré");
  });

  it("refuse un code ayant atteint sa limite d'utilisation", () => {
    const p = promo({ maxUses: 50, usedCount: 50 });
    expect(promotionEligible(p, 3000, at)).toMatchObject({ ok: false });
  });

  it("refuse un code réservé à un autre jour de la semaine", () => {
    const p = promo({ weekday: (at.getDay() + 1) % 7 });
    expect(promotionEligible(p, 3000, at)).toMatchObject({ ok: false });
  });

  it("accepte un code réservé au jour courant", () => {
    const p = promo({ weekday: at.getDay() });
    expect(promotionEligible(p, 3000, at).ok).toBe(true);
  });

  it("refuse un sous-total sous le minimum du code", () => {
    const p = promo({ minSubtotalCents: 3000 });
    const res = promotionEligible(p, 2999, at);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("30.00");
  });

  it("accepte pile au minimum", () => {
    expect(promotionEligible(promo({ minSubtotalCents: 3000 }), 3000, at).ok).toBe(true);
  });
});

// ─── promotionDiscount ─────────────────────────────────

describe("promotionDiscount", () => {
  it("applique une remise en pourcentage", () => {
    expect(promotionDiscount({ kind: "percent", value: 10 }, 2500, 350)).toEqual({
      discountCents: 250,
      freeDelivery: false,
    });
  });

  it("arrondit la remise en pourcentage au centime", () => {
    // 15 % de 13,33 € = 1,9995 € → 2,00 €
    expect(promotionDiscount({ kind: "percent", value: 15 }, 1333, 0).discountCents).toBe(200);
  });

  it("borne une remise en pourcentage aberrante au sous-total", () => {
    expect(promotionDiscount({ kind: "percent", value: 250 }, 2500, 350).discountCents).toBe(2500);
  });

  it("applique une remise en montant fixe", () => {
    expect(promotionDiscount({ kind: "amount", value: 500 }, 2500, 350)).toEqual({
      discountCents: 500,
      freeDelivery: false,
    });
  });

  it("borne une remise fixe au sous-total — jamais de total négatif", () => {
    expect(promotionDiscount({ kind: "amount", value: 9999 }, 2500, 350).discountCents).toBe(2500);
  });

  it("offre la livraison sans toucher au sous-total", () => {
    expect(promotionDiscount({ kind: "free_delivery", value: 0 }, 2500, 350)).toEqual({
      discountCents: 0,
      freeDelivery: true,
    });
  });

  it("n'offre pas la livraison en mode « à emporter » (frais nuls)", () => {
    expect(promotionDiscount({ kind: "free_delivery", value: 0 }, 2500, 0)).toEqual({
      discountCents: 0,
      freeDelivery: false,
    });
  });

  it("n'accorde rien pour un type de promotion inconnu", () => {
    expect(promotionDiscount({ kind: "mystere", value: 999 }, 2500, 350)).toEqual({
      discountCents: 0,
      freeDelivery: false,
    });
  });
});
