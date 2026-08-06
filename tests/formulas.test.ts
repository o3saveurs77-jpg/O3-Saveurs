import { describe, expect, it, vi } from "vitest";

/* `lib/formulas.ts` importe `lib/serialize` (pour `rowToDish`), qui n'a besoin
 * d'aucune base ; mais `lib/pricing.ts` importe `lib/prisma`. On le neutralise
 * comme dans `pricing.test.ts` : tout ce qui est testé ici est pur. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { priceFormula, isFormulaOrderable, formulaSupplements } from "@/lib/formulas";
import { priceLines } from "@/lib/pricing";
import type { Dish, Formula } from "@/lib/menu";

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
    ...over,
  };
}

const PLAT = dish({ id: "d1", name: "Mafé Bœuf", priceCents: 1200 });
const POISSON = dish({ id: "d2", name: "Thiéboudiène Poisson", priceCents: 1300 });
const BOISSON = dish({ id: "d3", cat: "boissons", name: "Jus de Bissap", priceCents: 350 });

/** Formule « plat + boisson » à 10,90 €, poisson à +4 €. */
function formula(over: Partial<Formula> = {}): Formula {
  return {
    id: "f1",
    code: "F1",
    name: "Express",
    desc: "Un plat au choix + une boisson",
    extra: "",
    priceCents: 1090,
    active: true,
    position: 0,
    slots: [
      {
        id: "s1",
        label: "Votre plat",
        required: true,
        position: 0,
        choices: [
          { id: "c1", dishId: "d1", supplementCents: 0, position: 0, dish: PLAT },
          { id: "c2", dishId: "d2", supplementCents: 400, position: 1, dish: POISSON },
        ],
      },
      {
        id: "s2",
        label: "Votre boisson",
        required: true,
        position: 1,
        choices: [{ id: "c3", dishId: "d3", supplementCents: 0, position: 0, dish: BOISSON }],
      },
    ],
    ...over,
  };
}

const catalogue = (list: Dish[] = [PLAT, POISSON, BOISSON]) => new Map(list.map((d) => [d.id, d]));

// ─── Prix ──────────────────────────────────────────────

describe("priceFormula", () => {
  it("facture le prix de la formule, pas la somme des plats", () => {
    const res = priceFormula(
      formula(),
      [
        { slotId: "s1", dishId: "d1" },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue(),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 12,00 € + 3,50 € à la carte, mais 10,90 € en formule.
    expect(res.value.unitPriceCents).toBe(1090);
  });

  it("ajoute le supplément du plat retenu", () => {
    const res = priceFormula(
      formula(),
      [
        { slotId: "s1", dishId: "d2" },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue(),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.unitPriceCents).toBe(1090 + 400);
    expect(res.value.opts["Votre plat"]).toContain("+4,00");
  });

  it("refuse un plat absent du créneau, même s'il existe à la carte", () => {
    const intrus = dish({ id: "d9", name: "Poisson Entier Grillé", priceCents: 1800 });
    const res = priceFormula(
      formula(),
      [
        { slotId: "s1", dishId: "d9" },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue([PLAT, POISSON, BOISSON, intrus]),
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Votre plat");
  });

  it("refuse un créneau obligatoire laissé vide", () => {
    const res = priceFormula(formula(), [{ slotId: "s1", dishId: "d1" }], catalogue());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Votre boisson");
  });

  it("accepte un créneau facultatif laissé vide", () => {
    const f = formula();
    f.slots[1].required = false;
    const res = priceFormula(f, [{ slotId: "s1", dishId: "d1" }], catalogue());

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.unitPriceCents).toBe(1090);
    expect(res.value.picks).toHaveLength(1);
  });

  it("refuse un plat épuisé ou retiré de la carte", () => {
    const epuise = dish({ id: "d1", name: "Mafé Bœuf", stock: 0 });
    const res = priceFormula(
      formula(),
      [
        { slotId: "s1", dishId: "d1" },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue([epuise, POISSON, BOISSON]),
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("épuisé");
  });

  it("exige les options obligatoires du plat retenu et facture leur supplément", () => {
    const avecRiz = dish({
      id: "d1",
      name: "Mafé Bœuf",
      options: [
        {
          name: "Riz",
          required: true,
          choices: [{ l: "Riz blanc" }, { l: "Riz rouge", priceCents: 100 }],
        },
      ],
    });

    const manquant = priceFormula(
      formula(),
      [
        { slotId: "s1", dishId: "d1" },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue([avecRiz, POISSON, BOISSON]),
    );
    expect(manquant.ok).toBe(false);

    const choisi = priceFormula(
      formula(),
      [
        { slotId: "s1", dishId: "d1", opts: { Riz: "Riz rouge" } },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue([avecRiz, POISSON, BOISSON]),
    );
    expect(choisi.ok).toBe(true);
    if (!choisi.ok) return;
    expect(choisi.value.unitPriceCents).toBe(1090 + 100);
  });

  it("refuse une formule désactivée", () => {
    const res = priceFormula(
      formula({ active: false }),
      [
        { slotId: "s1", dishId: "d1" },
        { slotId: "s2", dishId: "d3" },
      ],
      catalogue(),
    );
    expect(res.ok).toBe(false);
  });
});

// ─── Intégration dans le panier ────────────────────────

describe("priceLines avec une formule", () => {
  it("produit une ligne au prix de la formule et retient la composition", () => {
    const res = priceLines(
      [PLAT, POISSON, BOISSON],
      [
        {
          formulaId: "f1",
          qty: 2,
          picks: [
            { slotId: "s1", dishId: "d2" },
            { slotId: "s2", dishId: "d3" },
          ],
        },
      ],
      [formula()],
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [ligne] = res.value;
    expect(ligne.name).toBe("Formule Express");
    expect(ligne.formulaId).toBe("f1");
    expect(ligne.dishId).toBe("");
    expect(ligne.unitPriceCents).toBe(1490);
    expect(ligne.lineTotalCents).toBe(2980);
    expect(ligne.picks?.map((p) => p.dishId)).toEqual(["d2", "d3"]);
  });

  it("compte le stock des plats de la formule, pas celui de la formule", () => {
    const rare = dish({ id: "d1", name: "Mafé Bœuf", stock: 1 });
    const res = priceLines(
      [rare, POISSON, BOISSON],
      [
        {
          formulaId: "f1",
          qty: 2,
          picks: [
            { slotId: "s1", dishId: "d1" },
            { slotId: "s2", dishId: "d3" },
          ],
        },
      ],
      [formula()],
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Mafé Bœuf");
  });

  it("cumule le besoin d'un plat commandé à la fois seul et en formule", () => {
    const rare = dish({ id: "d1", name: "Mafé Bœuf", stock: 1 });
    const res = priceLines(
      [rare, POISSON, BOISSON],
      [
        { dishId: "d1", qty: 1 },
        {
          formulaId: "f1",
          qty: 1,
          picks: [
            { slotId: "s1", dishId: "d1" },
            { slotId: "s2", dishId: "d3" },
          ],
        },
      ],
      [formula()],
    );

    expect(res.ok).toBe(false);
  });

  it("refuse une formule inconnue", () => {
    const res = priceLines([PLAT, BOISSON], [{ formulaId: "inconnue", qty: 1, picks: [] }], []);
    expect(res.ok).toBe(false);
  });
});

// ─── Disponibilité et suppléments ──────────────────────

describe("isFormulaOrderable", () => {
  it("accepte une formule dont chaque créneau obligatoire a un plat commandable", () => {
    expect(isFormulaOrderable(formula())).toBe(true);
  });

  it("refuse une formule dont un créneau obligatoire n'a plus que des plats épuisés", () => {
    const f = formula();
    f.slots[1].choices = [
      { id: "c3", dishId: "d3", supplementCents: 0, position: 0, dish: dish({ id: "d3", stock: 0 }) },
    ];
    expect(isFormulaOrderable(f)).toBe(false);
  });

  it("ignore les créneaux facultatifs", () => {
    const f = formula();
    f.slots[1].required = false;
    f.slots[1].choices = [];
    expect(isFormulaOrderable(f)).toBe(true);
  });
});

describe("formulaSupplements", () => {
  it("liste les suppléments distincts, du moins cher au plus cher", () => {
    expect(formulaSupplements(formula())).toEqual([{ name: "Thiéboudiène Poisson", cents: 400 }]);
  });
});
