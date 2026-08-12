// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import type { Dish } from "@/lib/menu";
import type { FormulaPick } from "@/lib/types";

/**
 * Une formule ajoutée au panier doit y tenir en **une seule ligne**.
 *
 * Un client a signalé « j'ai sélectionné la formule, ça me met en individuel ».
 * Rien dans le code ne découpait la formule — mais rien ne le garantissait non
 * plus. Ces tests fixent l'invariant, pour qu'une évolution du panier ne puisse
 * pas se mettre à facturer séparément les plats d'une formule.
 */

const dish = (over: Partial<Dish> = {}): Dish =>
  ({
    id: "d-salade",
    name: "Salade composée",
    cat: "salades",
    desc: "",
    priceCents: 400,
    photo: null,
    available: true,
    popular: false,
    stock: null,
    position: 0,
    badge: null,
    allergens: [],
    options: [],
    ...over,
  }) as Dish;

const pick = (over: Partial<FormulaPick> = {}): FormulaPick => ({
  slotId: "s1",
  slotLabel: "Votre entrée",
  dishId: "d-salade",
  dishName: "Salade composée",
  supplementCents: 0,
  opts: {},
  ...over,
});

function cart() {
  return renderHook(() => useCart(), { wrapper: CartProvider });
}

beforeEach(() => {
  localStorage.clear();
});

describe("une formule au panier", () => {
  it("crée une ligne unique, pas une ligne par plat", () => {
    const { result } = cart();

    act(() => {
      result.current.addFormula({
        formulaId: "f3",
        code: "F3",
        name: "Gourmande",
        photo: null,
        picks: [
          pick(),
          pick({ slotId: "s2", slotLabel: "Votre plat", dishId: "d-brochette", dishName: "Brochette Poulet" }),
          pick({ slotId: "s3", slotLabel: "Votre dessert", dishId: "d-ananas", dishName: "Ananas frais" }),
        ],
        opts: {
          "Votre entrée": "Salade composée",
          "Votre plat": "Brochette Poulet",
          "Votre dessert": "Ananas frais",
        },
        unitPriceCents: 1690,
      });
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.count).toBe(1);
    expect(result.current.subtotalCents).toBe(1690);
  });

  it("porte son identifiant de formule et sa composition", () => {
    // C'est `formulaId` qui permet au panier et au récapitulatif de l'annoncer
    // comme une formule plutôt que comme un plat de plus.
    const { result } = cart();

    act(() => {
      result.current.addFormula({
        formulaId: "f3",
        code: "F3",
        name: "Gourmande",
        photo: null,
        picks: [pick()],
        opts: { "Votre entrée": "Salade composée" },
        unitPriceCents: 1690,
      });
    });

    const line = result.current.lines[0];
    expect(line.formulaId).toBe("f3");
    expect(line.formule).toBe("F3");
    expect(line.name).toBe("Formule Gourmande");
    expect(line.picks).toHaveLength(1);
    expect(line.dishId).toBe("");
  });

  it("ne facture pas le plat en double quand il est aussi pris à l'unité", () => {
    // Cas exact du signalement : « Salade composée » figure dans la formule ET
    // au panier à l'unité. Ce sont deux lignes distinctes et voulues — la
    // formule ne doit pas absorber l'autre, ni l'autre gonfler la formule.
    const { result } = cart();

    act(() => {
      result.current.add(dish());
      result.current.addFormula({
        formulaId: "f3",
        code: "F3",
        name: "Gourmande",
        photo: null,
        picks: [pick()],
        opts: { "Votre entrée": "Salade composée" },
        unitPriceCents: 1690,
      });
    });

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.subtotalCents).toBe(400 + 1690);
  });

  it("cumule deux formules identiques sur une seule ligne", () => {
    const { result } = cart();
    const args = {
      formulaId: "f3",
      code: "F3",
      name: "Gourmande",
      photo: null,
      picks: [pick()],
      opts: { "Votre entrée": "Salade composée" },
      unitPriceCents: 1690,
    };

    act(() => {
      result.current.addFormula(args);
      result.current.addFormula(args);
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].qty).toBe(2);
    expect(result.current.subtotalCents).toBe(3380);
  });

  it("garde deux lignes quand la composition diffère", () => {
    const { result } = cart();
    const base = {
      formulaId: "f3",
      code: "F3",
      name: "Gourmande",
      photo: null,
      opts: {},
      unitPriceCents: 1690,
    };

    act(() => {
      result.current.addFormula({ ...base, picks: [pick()] });
      result.current.addFormula({
        ...base,
        picks: [pick({ dishId: "d-cesar", dishName: "Salade César" })],
      });
    });

    expect(result.current.lines).toHaveLength(2);
  });
});
