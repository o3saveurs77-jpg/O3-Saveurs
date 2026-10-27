/* Barème de livraison à la distance — logique pure & testable.
 *
 * Le rapprochement par code postal traitait toutes les adresses d'une commune
 * au même tarif, alors que le trajet réel varie du simple au quadruple à
 * l'intérieur d'un même code postal. Ce module choisit le palier de tarif à
 * partir d'une distance mesurée.
 *
 * Aucun appel réseau ici : la mesure de distance vit dans `lib/geo.ts`, l'accès
 * à la base dans `lib/pricing.ts`. Ce fichier ne fait que la décision tarifaire,
 * ce qui le rend vérifiable au test unitaire — c'est lui qui facture.
 */

export interface DeliveryTier {
  idx: number;
  /** borne haute **incluse**, en kilomètres */
  maxKm: number;
  /**
   * borne haute **incluse** de la durée du trajet, en minutes ; `null` = pas de
   * limite de durée pour ce palier, seule la distance compte.
   */
  maxMinutes: number | null;
  feeCents: number;
  minimumCents: number;
}

/** Paliers de départ, utilisés au seed tant que la cliente n'a rien réglé. */
export const DEFAULT_TIERS: DeliveryTier[] = [
  { idx: 0, maxKm: 3, maxMinutes: 8, feeCents: 200, minimumCents: 1500 },
  { idx: 1, maxKm: 6, maxMinutes: 15, feeCents: 350, minimumCents: 2000 },
  { idx: 2, maxKm: 10, maxMinutes: 22, feeCents: 500, minimumCents: 2500 },
  { idx: 3, maxKm: 15, maxMinutes: 30, feeCents: 700, minimumCents: 3000 },
];

/**
 * Paliers triés par borne croissante, entrées invalides écartées.
 *
 * L'ordre d'affichage dans l'administration ne doit pas décider du tarif : un
 * palier saisi dans le désordre facturerait la mauvaise course. On trie sur
 * `maxKm`, jamais sur `idx`.
 */
export function sortTiers(tiers: DeliveryTier[]): DeliveryTier[] {
  return tiers
    .filter((t) => Number.isFinite(t.maxKm) && t.maxKm > 0)
    .slice()
    .sort((a, b) => a.maxKm - b.maxKm);
}

/** Distance maximale livrée, ou `null` si aucun palier n'est défini. */
export function maxDeliveryKm(tiers: DeliveryTier[]): number | null {
  const sorted = sortTiers(tiers);
  return sorted.length ? sorted[sorted.length - 1].maxKm : null;
}

/**
 * Palier applicable à une distance, ou `null` si l'adresse est hors de portée.
 *
 * `null` en entrée (distance inconnue) renvoie `null` : on ne devine pas un
 * tarif. L'appelant décide alors de replier sur les zones ou de refuser — il ne
 * doit jamais y avoir de tarif « par défaut » silencieux, qui ferait livrer
 * 14 km au prix de 2 km.
 */
export function tierForDistance(
  tiers: DeliveryTier[],
  km: number | null | undefined,
): DeliveryTier | null {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return null;
  for (const tier of sortTiers(tiers)) {
    if (km <= tier.maxKm) return tier;
  }
  return null;
}

export type TripTier =
  | { ok: true; tier: DeliveryTier }
  /** Au-delà du dernier palier : par la distance, ou par la durée du trajet. */
  | { ok: false; over: "km" | "minutes" };

/**
 * Palier d'une course, selon sa distance **et** la durée du trajet.
 *
 * Chaque critère désigne son palier ; on facture **le plus cher des deux**.
 * Une course courte mais lente — 4 km de centre-ville aux heures chargées —
 * mobilise le livreur aussi longtemps qu'une course plus longue, et doit
 * coûter autant. Un palier sans durée (`maxMinutes: null`) ne borne que la
 * distance.
 *
 * Les paliers sont ordonnés par distance (`sortTiers`) : c'est cet ordre qui
 * fait foi pour « le plus cher », pas les montants saisis.
 */
export function tierForTrip(
  tiers: DeliveryTier[],
  km: number,
  minutes: number,
): TripTier | null {
  if (!Number.isFinite(km) || km < 0 || !Number.isFinite(minutes) || minutes < 0) return null;
  const sorted = sortTiers(tiers);
  if (sorted.length === 0) return null;

  const byKm = sorted.findIndex((t) => km <= t.maxKm);
  if (byKm < 0) return { ok: false, over: "km" };
  const byMinutes = sorted.findIndex((t) => t.maxMinutes === null || minutes <= t.maxMinutes);
  if (byMinutes < 0) return { ok: false, over: "minutes" };

  return { ok: true, tier: sorted[Math.max(byKm, byMinutes)] };
}

/** Durée maximale livrée, ou `null` si le dernier palier n'en fixe pas. */
export function maxDeliveryMinutes(tiers: DeliveryTier[]): number | null {
  const sorted = sortTiers(tiers);
  return sorted.length ? sorted[sorted.length - 1].maxMinutes : null;
}

/** « 12 min ». */
export function formatMinutes(minutes: number): string {
  return `${Math.round(minutes)} min`;
}

/**
 * Message de refus d'une adresse hors de portée, partagé par la commande et
 * l'estimation affichée — le client lit la même phrase aux deux endroits.
 */
export function outOfRangeMessage(
  tiers: DeliveryTier[],
  km: number,
  minutes: number,
  found: TripTier | null,
): string {
  const suffix = " Vous pouvez commander à emporter.";
  if (found && !found.ok && found.over === "minutes") {
    const limite = maxDeliveryMinutes(tiers);
    return `Cette adresse est à ${formatMinutes(minutes)} de route, au-delà de notre limite de livraison${
      limite !== null ? ` de ${formatMinutes(limite)}` : ""
    }.${suffix}`;
  }
  const limite = maxDeliveryKm(tiers);
  return limite !== null
    ? `Cette adresse est à ${formatKm(km)} km, au-delà de notre rayon de livraison de ${formatKm(limite)} km.${suffix}`
    : "Nous ne livrons pas encore à cette adresse.";
}

/** Libellé d'un palier pour l'administration et le récapitulatif client. */
export function tierLabel(tiers: DeliveryTier[], tier: DeliveryTier): string {
  const sorted = sortTiers(tiers);
  const i = sorted.findIndex((t) => t.idx === tier.idx);
  const from = i > 0 ? sorted[i - 1].maxKm : 0;
  return `${formatKm(from)} – ${formatKm(tier.maxKm)} km`;
}

/** « 3 » plutôt que « 3.0 », « 2,5 » à la française. */
export function formatKm(km: number): string {
  return (Math.round(km * 10) / 10).toLocaleString("fr-FR");
}

/**
 * Distance à vol d'oiseau, en kilomètres (formule de haversine).
 *
 * Sert de **garde-fou**, pas de tarif : la distance routière ne peut jamais
 * être inférieure à la distance à vol d'oiseau. Une réponse de l'API qui
 * l'annonce plus courte est incohérente et doit être rejetée plutôt que
 * facturée.
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // rayon moyen de la Terre, km
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
