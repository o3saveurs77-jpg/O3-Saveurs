/* Logique de zone de livraison — pure & testable.
 *
 * Deux corrections par rapport à la version précédente :
 *  · la correspondance était une inclusion bidirectionnelle, donc « marne »
 *    tombait sur Champs-sur-Marne (zone 1) avant Vaires-sur-Marne (zone 2) —
 *    en cas d'ambiguïté c'était toujours la zone la moins chère qui gagnait ;
 *  · `normalizeCity` supprimait les chiffres, donc un code postal devenait la
 *    chaîne vide et aucune zone ne pouvait être trouvée par code postal.
 *
 * La règle est maintenant : code postal d'abord (fiable), puis nom de commune
 * en correspondance exacte, et enfin suggestions par préfixe pour guider la
 * saisie — mais jamais de correspondance approximative silencieuse.
 */

import type { Zone } from "./menu";

/** Normalise un nom de commune : minuscules, sans accents ni séparateurs. */
export function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

/** Extrait un code postal français d'une saisie libre. */
export function extractZip(s: string): string | null {
  const m = String(s ?? "").match(/\b\d{5}\b/);
  return m ? m[0] : null;
}

export interface ZoneMatch {
  zoneIdx: number;
  city: string;
  /** comment la zone a été trouvée — utile pour les messages d'erreur */
  via: "zip" | "city";
}

/** Cherche une zone par code postal. C'est la méthode fiable. */
export function findZoneForZip(zones: Zone[], zip: string): ZoneMatch | null {
  const z = extractZip(zip);
  if (!z) return null;
  for (const zone of zones) {
    if (zone.zips.includes(z)) {
      return { zoneIdx: zone.idx, city: zone.villes[0] ?? "", via: "zip" };
    }
  }
  return null;
}

/** Cherche une zone par nom de commune, en correspondance **exacte** normalisée. */
export function findZoneForCity(zones: Zone[], query: string): ZoneMatch | null {
  const q = normalizeCity(query);
  if (!q) return null;
  for (const zone of zones) {
    for (const ville of zone.villes) {
      if (normalizeCity(ville) === q) {
        return { zoneIdx: zone.idx, city: ville, via: "city" };
      }
    }
  }
  return null;
}

/**
 * Résolution complète : code postal prioritaire, nom de commune en secours.
 * Utilisée côté serveur pour déterminer la zone facturée — le client ne choisit
 * jamais sa propre zone tarifaire.
 */
export function resolveZone(
  zones: Zone[],
  { zip, city }: { zip?: string | null; city?: string | null },
): ZoneMatch | null {
  if (zip) {
    const byZip = findZoneForZip(zones, zip);
    if (byZip) return byZip;
  }
  if (city) {
    const byCity = findZoneForCity(zones, city);
    if (byCity) return byCity;
  }
  return null;
}

/**
 * Communes proches d'une saisie incomplète, pour proposer une correction
 * plutôt que de deviner. Ne sert qu'à l'interface, jamais à la facturation.
 */
export function suggestCities(zones: Zone[], query: string, limit = 5): string[] {
  const q = normalizeCity(query);
  if (q.length < 2) return [];
  const out: string[] = [];
  for (const zone of zones) {
    for (const ville of zone.villes) {
      const v = normalizeCity(ville);
      if (v.startsWith(q) || v.includes(q)) out.push(ville);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Zone par son index, ou null. */
export function zoneByIdx(zones: Zone[], idx: number | null | undefined): Zone | null {
  if (idx === null || idx === undefined) return null;
  return zones.find((z) => z.idx === idx) ?? null;
}
