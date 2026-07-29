import { describe, it, expect } from "vitest";
import { fmtPrice, items, cats, zones } from "@/lib/menu";

/**
 * `Intl.NumberFormat` insère une espace insécable étroite (U+202F) avant le
 * symbole €, et le caractère exact dépend de la version d'ICU embarquée. On
 * normalise donc les espaces : le test vérifie le format, pas la version de Node.
 */
const nbsp = (s: string) => s.replace(/[  \s]/g, " ");

describe("fmtPrice", () => {
  /**
   * `fmtPrice` prend désormais des **centimes** : c'est l'unité qui circule
   * partout dans le code, précisément pour ne plus manipuler de flottants.
   */
  it("formate des centimes en euros, au format français", () => {
    expect(nbsp(fmtPrice(1200))).toBe("12,00 €");
    expect(nbsp(fmtPrice(350))).toBe("3,50 €");
    expect(nbsp(fmtPrice(299))).toBe("2,99 €");
    expect(nbsp(fmtPrice(0))).toBe("0,00 €");
  });

  it("utilise la virgule comme séparateur décimal", () => {
    expect(fmtPrice(1197)).toContain("11,97");
  });

  it("affiche un tiret pour un prix non défini", () => {
    expect(fmtPrice(null)).toBe("—");
  });
});

describe("catalogue de seed (items)", () => {
  it("contient des plats avec des identifiants uniques", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items.length).toBeGreaterThan(40);
  });

  it("chaque plat a une catégorie connue", () => {
    const catIds = new Set(cats.map((c) => c.id));
    for (const it of items) {
      expect(catIds.has(it.cat)).toBe(true);
    }
  });

  /** Les données de seed sont en euros : c'est `prisma/seed.ts` qui convertit. */
  it("les prix sont soit null (à définir) soit positifs", () => {
    for (const it of items) {
      if (it.price !== null) expect(it.price).toBeGreaterThan(0);
    }
  });

  it("les plats marqués Bientôt n'ont pas de prix", () => {
    for (const it of items) {
      if (it.badge === "Bientôt") expect(it.price).toBeNull();
    }
  });
});

describe("zones de seed", () => {
  it("ont un minimum supérieur ou égal aux frais, et des communes", () => {
    for (const z of zones) {
      expect(z.fee).toBeGreaterThan(0);
      expect(z.min).toBeGreaterThanOrEqual(z.fee);
      expect(z.villes.length).toBeGreaterThan(0);
    }
  });

  /**
   * Les codes postaux sont la clé de rapprochement côté serveur : une zone sans
   * code postal ne serait jamais atteinte, et la commande serait refusée.
   */
  it("déclarent au moins un code postal à 5 chiffres", () => {
    for (const z of zones) {
      expect(z.zips?.length ?? 0).toBeGreaterThan(0);
      for (const zip of z.zips ?? []) {
        expect(zip).toMatch(/^\d{5}$/);
      }
    }
  });
});
