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
  feeCents: number;
  minimumCents: number;
}

/** Paliers de départ, utilisés au seed tant que la cliente n'a rien réglé. */
export const DEFAULT_TIERS: DeliveryTier[] = [
  { idx: 0, maxKm: 3, feeCents: 200, minimumCents: 1500 },
  { idx: 1, maxKm: 6, feeCents: 350, minimumCents: 2000 },
  { idx: 2, maxKm: 10, feeCents: 500, minimumCents: 2500 },
  { idx: 3, maxKm: 15, feeCents: 700, minimumCents: 3000 },
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
