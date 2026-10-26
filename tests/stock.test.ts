/* Tests de `lib/stock.ts`.
 *
 * Deux fonctions pures sont couvertes. `reserveStock`, `releaseStock`,
 * `applyMovement` et `lowStockDishes` ouvrent une transaction Prisma (et
 * `lowStockDishes` du SQL brut) — les tester exigerait une instance
 * PostgreSQL, pas un test unitaire. D'où l'extraction de la décision que
 * prenait `applyMovement` dans `stockApresMouvement`, testable sans base.
 *
 * L'enjeu de `neededByDish` : deux lignes du même plat puisent dans le **même**
 * stock. Si elles étaient traitées séparément, deux lignes de 3 parts de mafé
 * passeraient chacune le contrôle « stock >= 3 » alors qu'il n'en reste que 4,
 * et la cuisine découvrirait le manque au moment de préparer.
 *
 * L'enjeu de `stockApresMouvement` : déclarer une rupture doit retirer le plat
 * de la vente. L'écran Stocks l'affirme trois fois, et c'était faux.
 */

import { describe, it, expect } from "vitest";
import { neededByDish, stockApresMouvement } from "@/lib/stock";

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

describe("stockApresMouvement — retrait de la vente", () => {
  it("retire le plat de la vente quand une sortie vide le stock", () => {
    // Le défaut : `applyMovement` n'écrivait `available` que dans le sens
    // « true ». La cliente sortait ses 4 dernières parts et le plat restait
    // commandable sur le site, interrupteur « Disponible » allumé.
    expect(stockApresMouvement({ stockActuel: 4, delta: -4, reason: "perte" })).toEqual({
      stock: 0,
      delta: -4,
      available: false,
    });
  });

  it("retire le plat de la vente sur une rupture déclarée à la main", () => {
    // Le bouton « Rupture » de l'écran Stocks : un inventaire à 0, annoncé
    // « retiré de la vente » à l'écran.
    expect(
      stockApresMouvement({ stockActuel: 7, delta: 0, reason: "inventaire", absolute: 0 }),
    ).toEqual({ stock: 0, delta: -7, available: false });
  });

  it("laisse le plat en vente tant qu'il reste du stock", () => {
    expect(stockApresMouvement({ stockActuel: 10, delta: -3, reason: "perte" })).toEqual({
      stock: 7,
      delta: -3,
      available: true,
    });
  });
});

describe("stockApresMouvement — remise en vente", () => {
  it("remet le plat en vente au réapprovisionnement", () => {
    // L'autre moitié de la règle, qui fonctionnait déjà : sans elle, la cliente
    // réapprovisionne et le plat reste invisible sur la carte.
    expect(stockApresMouvement({ stockActuel: 0, delta: 12, reason: "reappro" })).toEqual({
      stock: 12,
      delta: 12,
      available: true,
    });
  });

  it("remet le plat en vente sur un inventaire qui constate du stock", () => {
    expect(
      stockApresMouvement({ stockActuel: 0, delta: 0, reason: "inventaire", absolute: 6 }),
    ).toEqual({ stock: 6, delta: 6, available: true });
  });
});

describe("stockApresMouvement — cas limites", () => {
  it("ne descend jamais sous zéro", () => {
    // Un stock négatif se lirait « -3 en stock » sur l'écran Stocks et ferait
    // passer le plat sous son seuil d'alerte pour toujours.
    expect(stockApresMouvement({ stockActuel: 2, delta: -5, reason: "perte" }).stock).toBe(0);
    expect(
      stockApresMouvement({ stockActuel: 2, delta: 0, reason: "inventaire", absolute: -5 }).stock,
    ).toBe(0);
  });

  it("traite un stock illimité comme zéro, le temps du mouvement", () => {
    // Donner un stock initial à un plat illimité passe par un `PATCH` du plat,
    // pas par un mouvement (cf. l'en-tête de `StocksAdmin`). Si un mouvement y
    // arrive quand même, le plat cesse d'être illimité : il a désormais une
    // quantité, et la règle habituelle s'applique.
    expect(stockApresMouvement({ stockActuel: null, delta: 5, reason: "reappro" })).toEqual({
      stock: 5,
      delta: 5,
      available: true,
    });
  });

  it("n'inscrit rien au journal quand un inventaire ne change rien", () => {
    // `applyMovement` n'écrit un `StockMovement` que si le delta est non nul :
    // un inventaire qui confirme la quantité ne doit pas polluer l'historique.
    expect(
      stockApresMouvement({ stockActuel: 5, delta: 0, reason: "inventaire", absolute: 5 }).delta,
    ).toBe(0);
  });

  it("déduit le delta d'un inventaire, au lieu de reprendre celui reçu", () => {
    // L'écran envoie `delta: 0` avec la valeur constatée : c'est l'écart qui
    // doit être journalisé, sinon « où sont passées les 12 parts ? » reste sans
    // réponse.
    expect(
      stockApresMouvement({ stockActuel: 12, delta: 0, reason: "inventaire", absolute: 9 }).delta,
    ).toBe(-3);
  });
});
