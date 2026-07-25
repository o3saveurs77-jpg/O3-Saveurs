import { describe, it, expect } from "vitest";
import { normalizeCity, findZoneForCity } from "@/lib/zones";
import { zones } from "@/lib/menu";

describe("normalizeCity", () => {
  it("met en minuscules et retire accents/espaces/tirets", () => {
    expect(normalizeCity("Champs-sur-Marne")).toBe("champssurmarne");
    expect(normalizeCity("Émerainville")).toBe("emerainville");
    expect(normalizeCity("  LOGNES  ")).toBe("lognes");
  });
});

describe("findZoneForCity", () => {
  it("trouve une ville exacte dans la bonne zone", () => {
    const m = findZoneForCity(zones, "Lognes");
    expect(m).not.toBeNull();
    expect(m!.zoneIdx).toBe(0);
    expect(m!.city).toBe("Lognes");
  });

  it("est insensible aux accents et à la casse", () => {
    expect(findZoneForCity(zones, "émerainville")).toMatchObject({ zoneIdx: 0 });
    expect(findZoneForCity(zones, "TORCY")).toMatchObject({ zoneIdx: 0 });
  });

  it("trouve une ville d'une zone plus lointaine", () => {
    const m = findZoneForCity(zones, "Serris");
    expect(m!.zoneIdx).toBe(3);
  });

  it("renvoie null hors zone et pour une saisie vide", () => {
    expect(findZoneForCity(zones, "Marseille")).toBeNull();
    expect(findZoneForCity(zones, "")).toBeNull();
  });
});
