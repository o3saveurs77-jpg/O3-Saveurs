/* Logique de zone de livraison — pure & testable */

import type { Zone } from "./menu";

/** Normalise une chaîne : minuscules, sans accents ni caractères non alpha. */
export function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export interface ZoneMatch {
  zoneIdx: number;
  city: string;
}

/**
 * Cherche la zone correspondant à une saisie de ville/commune.
 * Correspondance par inclusion normalisée (souple aux fautes de frappe partielles).
 * Renvoie null si hors zone.
 */
export function findZoneForCity(zones: Zone[], query: string): ZoneMatch | null {
  const q = normalizeCity(query);
  if (!q) return null;
  for (let i = 0; i < zones.length; i++) {
    for (const ville of zones[i].villes) {
      const v = normalizeCity(ville);
      if (v.includes(q) || q.includes(v)) {
        return { zoneIdx: i, city: ville };
      }
    }
  }
  return null;
}
