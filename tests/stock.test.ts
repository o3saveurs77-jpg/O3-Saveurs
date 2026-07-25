/* Tests de `lib/stock.ts`.
 *
 * Seule `neededByDish` est couverte : c'est la seule fonction pure du module.
 * `reserveStock`, `releaseStock`, `applyMovement` et `lowStockDishes` ouvrent
 * une transaction Prisma (et `lowStockDishes` du SQL brut) — les tester
 * exigerait une instance PostgreSQL, pas un test unitaire.
 *
 * L'enjeu de `neededByDish` : deux lignes du même plat puisent dans le **même**
 * stock. Si elles étaient traitées séparément, deux lignes de 3 parts de mafé
 * passeraient chacune le contrôle « stock >= 3 » alors qu'il n'en reste que 4,
 * et la cuisine découvrirait le manque au moment de préparer.
 */

import { describe, it, expect } from "vitest";
import { neededByDish } from "@/lib/stock";

describe("neededByDish", () => {
  it("renvoie une map vide pour un panier vide", () => {
    expect(neededByDish([]).size).toBe(0);
  });

  it("reporte la quantité d'une ligne unique", () => {
    const m = neededByDish([{ dishId: "d1", qty: 2 }]);
    expect(m.size).toBe(1);
    expect(m.get("d1")).toBe(2);
  });

  it("cumule deux lignes du même plat aux options différentes", () => {
    // Cas réel : « Tcheb Poulet · riz blanc » et « Tcheb Poulet · riz rouge »
    // sont deux lignes de panier distinctes, mais un seul et même stock.
    const m = neededByDish([
      { dishId: "tcheb", qty: 3 },
      { dishId: "tcheb", qty: 1 },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("tcheb")).toBe(4);
  });

  it("garde les plats distincts séparés", () => {
    const m = neededByDish([
      { dishId: "mafe", qty: 2 },
      { dishId: "yassa", qty: 1 },
      { dishId: "mafe", qty: 5 },
    ]);
    expect(m.size).toBe(2);
    expect(m.get("mafe")).toBe(7);
    expect(m.get("yassa")).toBe(1);
  });

  it("cumule sur plus de deux lignes du même plat", () => {
    const lines = Array.from({ length: 5 }, () => ({ dishId: "pastels", qty: 2 }));
    expect(neededByDish(lines).get("pastels")).toBe(10);
  });

  it("ne renvoie rien pour un plat absent du panier", () => {
    const m = neededByDish([{ dishId: "d1", qty: 1 }]);
    expect(m.get("inconnu")).toBeUndefined();
    expect(m.has("inconnu")).toBe(false);
  });

  it("n'altère pas les lignes reçues", () => {
    const lines = [{ dishId: "d1", qty: 2 }];
    neededByDish(lines);
    expect(lines).toEqual([{ dishId: "d1", qty: 2 }]);
  });

  it("préserve l'ordre de première apparition des plats", () => {
    const m = neededByDish([
      { dishId: "b", qty: 1 },
      { dishId: "a", qty: 1 },
      { dishId: "b", qty: 1 },
    ]);
    expect([...m.keys()]).toEqual(["b", "a"]);
  });
});
