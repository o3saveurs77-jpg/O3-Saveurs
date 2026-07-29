import { describe, it, expect } from "vitest";
import {
  normalizeCity,
  extractZip,
  findZoneForCity,
  findZoneForZip,
  resolveZone,
  suggestCities,
  zoneByIdx,
} from "@/lib/zones";
import { zones as seedZones } from "@/lib/menu";
import type { Zone } from "@/lib/menu";

/**
 * `lib/menu.ts` porte les données de seed en euros (`SeedZone`). Les fonctions
 * de zone travaillent sur le type applicatif `Zone`, en centimes. On convertit
 * ici comme le fait `prisma/seed.ts`.
 */
const zones: Zone[] = seedZones.map((z, idx) => ({
  idx,
  feeCents: Math.round(z.fee * 100),
  minimumCents: Math.round(z.min * 100),
  villes: z.villes,
  zips: z.zips ?? [],
}));

describe("normalizeCity", () => {
  it("met en minuscules et retire accents, espaces et tirets", () => {
    expect(normalizeCity("Champs-sur-Marne")).toBe("champssurmarne");
    expect(normalizeCity("Émerainville")).toBe("emerainville");
    expect(normalizeCity("  LOGNES  ")).toBe("lognes");
  });
});

describe("extractZip", () => {
  it("récupère un code postal dans une saisie libre", () => {
    expect(extractZip("77185")).toBe("77185");
    expect(extractZip("12 rue des Acacias, 77185 Lognes")).toBe("77185");
  });

  it("renvoie null sans code postal à 5 chiffres", () => {
    expect(extractZip("Lognes")).toBeNull();
    expect(extractZip("7718")).toBeNull();
    expect(extractZip("")).toBeNull();
  });
});

describe("findZoneForCity", () => {
  it("trouve une ville exacte dans la bonne zone", () => {
    const m = findZoneForCity(zones, "Lognes");
    expect(m).not.toBeNull();
    expect(m!.zoneIdx).toBe(0);
    expect(m!.city).toBe("Lognes");
    expect(m!.via).toBe("city");
  });

  it("est insensible aux accents et à la casse", () => {
    expect(findZoneForCity(zones, "émerainville")).toMatchObject({ zoneIdx: 0 });
    expect(findZoneForCity(zones, "TORCY")).toMatchObject({ zoneIdx: 0 });
  });

  it("trouve une ville d'une zone plus lointaine", () => {
    expect(findZoneForCity(zones, "Serris")!.zoneIdx).toBe(3);
  });

  it("renvoie null hors zone et pour une saisie vide", () => {
    expect(findZoneForCity(zones, "Marseille")).toBeNull();
    expect(findZoneForCity(zones, "")).toBeNull();
  });

  /**
   * Régression : la correspondance se faisait par inclusion bidirectionnelle,
   * si bien qu'une saisie partielle tombait sur la première zone rencontrée —
   * donc systématiquement la moins chère. Un client de Vaires-sur-Marne (zone 2)
   * se voyait facturer les frais de Champs-sur-Marne (zone 1).
   */
  it("n'accepte plus une correspondance partielle", () => {
    expect(findZoneForCity(zones, "marne")).toBeNull();
    expect(findZoneForCity(zones, "la")).toBeNull();
    expect(findZoneForCity(zones, "Log")).toBeNull();
  });
});

describe("findZoneForZip", () => {
  it("trouve la zone par code postal", () => {
    expect(findZoneForZip(zones, "77185")!.zoneIdx).toBe(0);
    expect(findZoneForZip(zones, "77600")!.zoneIdx).toBe(1);
    expect(findZoneForZip(zones, "77700")!.zoneIdx).toBe(3);
  });

  it("renvoie null pour un code postal hors zone", () => {
    expect(findZoneForZip(zones, "75001")).toBeNull();
  });
});

describe("resolveZone", () => {
  it("privilégie le code postal sur la commune", () => {
    // Code postal de la zone 3, nom de commune de la zone 0 : le code gagne,
    // parce que c'est la donnée fiable.
    const m = resolveZone(zones, { zip: "77340", city: "Lognes" });
    expect(m!.zoneIdx).toBe(2);
    expect(m!.via).toBe("zip");
  });

  it("retombe sur la commune quand le code postal est absent ou inconnu", () => {
    expect(resolveZone(zones, { zip: null, city: "Torcy" })!.via).toBe("city");
    expect(resolveZone(zones, { zip: "99999", city: "Torcy" })!.zoneIdx).toBe(0);
  });

  it("renvoie null quand rien ne correspond — la commande en livraison est alors refusée", () => {
    expect(resolveZone(zones, { zip: "13001", city: "Marseille" })).toBeNull();
    expect(resolveZone(zones, {})).toBeNull();
  });
});

describe("suggestCities", () => {
  it("propose des communes pour une saisie incomplète", () => {
    expect(suggestCities(zones, "log")).toContain("Lognes");
    expect(suggestCities(zones, "ch").length).toBeGreaterThan(0);
  });

  it("ne propose rien en dessous de deux caractères", () => {
    expect(suggestCities(zones, "l")).toEqual([]);
  });
});

describe("zoneByIdx", () => {
  it("retrouve une zone par son index", () => {
    expect(zoneByIdx(zones, 0)!.feeCents).toBe(250);
    expect(zoneByIdx(zones, 3)!.minimumCents).toBe(3500);
  });

  it("renvoie null pour un index absent ou nul", () => {
    expect(zoneByIdx(zones, 99)).toBeNull();
    expect(zoneByIdx(zones, null)).toBeNull();
  });
});
