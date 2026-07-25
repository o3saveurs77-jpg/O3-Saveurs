import { describe, it, expect } from "vitest";
import { fmtPrice, items, cats, zones } from "@/lib/menu";

describe("fmtPrice", () => {
  it("formate en euros à 2 décimales (format FR)", () => {
    expect(fmtPrice(12)).toBe("12,00 €");
    expect(fmtPrice(3.5)).toBe("3,50 €");
    expect(fmtPrice(2.99)).toBe("2,99 €");
  });
});

describe("catalogue (items)", () => {
  it("contient des plats avec des ids uniques", () => {
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

describe("zones", () => {
  it("ont un minimum >= aux frais et des villes", () => {
    for (const z of zones) {
      expect(z.fee).toBeGreaterThan(0);
      expect(z.min).toBeGreaterThanOrEqual(z.fee);
      expect(z.villes.length).toBeGreaterThan(0);
    }
  });
});
