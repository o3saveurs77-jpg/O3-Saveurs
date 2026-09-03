import "server-only";

import { haversineKm } from "@/lib/delivery";

/* Accès aux API Google Maps — **serveur uniquement**.
 *
 * `server-only` en tête n'est pas décoratif : si un composant client importait
 * ce module, la compilation échouerait au lieu de livrer `GOOGLE_MAPS_API_KEY`
 * dans le bundle du navigateur. La clé n'est donc jamais exposée, et
 * l'autocomplétion d'adresse passe par nos propres routes (`/api/address/*`),
 * qui sont limitées en débit.
 *
 * Tout est facultatif : sans clé, chaque fonction renvoie `null` ou un échec
 * explicite, et `lib/pricing.ts` replie sur les zones par code postal. Le site
 * continue donc de vendre si la clé manque, expire ou dépasse son quota.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  /** identifiant Google, réutilisé pour la mesure de distance */
  placeId: string;
  /** libellé complet affiché au client */
  label: string;
}

const KEY = () => process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";

/** La tarification à la distance est-elle utilisable ? */
export function isGeoConfigured(): boolean {
  return KEY().length > 0;
}

/* Cache mémoire par instance. Les adresses se répètent beaucoup (un client
 * recommande, plusieurs clients d'un même immeuble), et chaque appel évité est
 * facturé en moins par Google. Volontairement borné : une instance serverless
 * qui vit longtemps ne doit pas accumuler indéfiniment. */
const CACHE_MAX = 500;
const distanceCache = new Map<string, number>();
const geocodeCache = new Map<string, LatLng>();

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/** Appel HTTP borné dans le temps : une API lente ne doit pas bloquer une commande. */
async function fetchJson(url: string, timeoutMs = 4000): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    // réseau coupé, quota dépassé, délai dépassé — l'appelant repliera
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Suggestions d'adresses (Places Autocomplete), restreintes à la France.
 *
 * `sessionToken` regroupe les frappes d'une même recherche en une seule
 * facturation côté Google — sans lui, chaque caractère tapé est un appel payant.
 */
export async function suggestAddresses(
  query: string,
  sessionToken?: string,
): Promise<AddressSuggestion[]> {
  if (!isGeoConfigured() || query.trim().length < 3) return [];

  const params = new URLSearchParams({
    input: query.trim(),
    key: KEY(),
    language: "fr",
    components: "country:fr",
    types: "address",
  });
  if (sessionToken) params.set("sessiontoken", sessionToken);

  const data = await fetchJson(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
  );
  if (!data || data.status !== "OK") return [];

  const predictions = Array.isArray(data.predictions) ? data.predictions : [];
  return predictions
    .slice(0, 5)
    .map((p) => {
      const row = p as { place_id?: string; description?: string };
      return { placeId: row.place_id ?? "", label: row.description ?? "" };
    })
    .filter((s) => s.placeId && s.label);
}

/**
 * Coordonnées d'une adresse, par Google quand la clé existe.
 */
async function geocodeGoogle(address: string): Promise<LatLng | null> {
  if (!isGeoConfigured()) return null;

  const params = new URLSearchParams({
    address,
    key: KEY(),
    language: "fr",
    region: "fr",
  });
  const data = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!data || data.status !== "OK") return null;

  const results = Array.isArray(data.results) ? data.results : [];
  const loc = (results[0] as { geometry?: { location?: LatLng } } | undefined)?.geometry?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { lat: loc.lat, lng: loc.lng };
}

/**
 * Repli sans clé : la Base Adresse Nationale.
 *
 * `api-adresse.data.gouv.fr` est le service officiel de l'État — gratuit,
 * sans clé, sans quota déclaré, et fait autorité sur les adresses françaises,
 * ce qui est exactement le périmètre d'un restaurant de Seine-et-Marne. Il ne
 * remplace pas Google pour la **distance routière** (il ne mesure rien), mais
 * il suffit pour le seul point qui manquait : la position du restaurant.
 *
 * Sans ce repli, `deliveryOrigin()` renvoyait `null` faute de clé, les
 * réglages restaient vides, et le nœud `Restaurant` du JSON-LD sortait sans
 * `geo` — un restaurant sans coordonnées, pour un moteur qui classe d'abord
 * sur la proximité.
 *
 * Le score écarte les à-peu-près : l'API répond toujours quelque chose, et
 * une rue homonyme à l'autre bout du pays vaut moins que pas de réponse.
 */
async function geocodeBAN(address: string): Promise<LatLng | null> {
  const params = new URLSearchParams({ q: address, limit: "1", autocomplete: "0" });
  const data = await fetchJson(`https://api-adresse.data.gouv.fr/search/?${params}`);
  if (!data) return null;

  const features = Array.isArray(data.features) ? data.features : [];
  const hit = features[0] as
    | { geometry?: { coordinates?: number[] }; properties?: { score?: number } }
    | undefined;
  if (!hit || (hit.properties?.score ?? 0) < 0.4) return null;

  // La BAN rend [longitude, latitude] — l'ordre GeoJSON, l'inverse de l'usage.
  const [lng, lat] = hit.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: lat as number, lng: lng as number };
}

/** Coordonnées d'une adresse libre, ou `null`. */
export async function geocode(address: string): Promise<LatLng | null> {
  const clean = address.trim();
  if (!clean) return null;

  const key = clean.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const found = (await geocodeGoogle(clean)) ?? (await geocodeBAN(clean));
  if (!found) return null;

  return remember(geocodeCache, key, found);
}

/**
 * Distance **routière** en kilomètres entre le restaurant et une adresse.
 *
 * `destination` accepte soit un `place_id` (issu de l'autocomplétion, sans
 * ambiguïté), soit une adresse libre saisie à la main.
 *
 * Renvoie `null` dès que la mesure n'est pas fiable : pas de clé, API muette,
 * trajet introuvable, ou résultat incohérent. `null` veut dire « je ne sais
 * pas », jamais « c'est gratuit » — l'appelant replie sur les zones.
 */
export async function roadDistanceKm(
  origin: string | LatLng,
  destination: { placeId?: string | null; address?: string | null },
): Promise<number | null> {
  if (!isGeoConfigured()) return null;

  const dest = destination.placeId
    ? `place_id:${destination.placeId}`
    : destination.address?.trim();
  if (!dest) return null;

  const from = typeof origin === "string" ? origin : `${origin.lat},${origin.lng}`;
  const cacheKey = `${from}|${dest}`;
  const cached = distanceCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    origins: from,
    destinations: dest,
    key: KEY(),
    language: "fr",
    region: "fr",
    units: "metric",
    mode: "driving",
  });

  const data = await fetchJson(
    `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`,
  );
  if (!data || data.status !== "OK") return null;

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const element = (
    rows[0] as { elements?: { status?: string; distance?: { value?: number } }[] } | undefined
  )?.elements?.[0];

  if (!element || element.status !== "OK") return null;
  const meters = element.distance?.value;
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) return null;

  return remember(distanceCache, cacheKey, meters / 1000);
}

/**
 * Garde-fou de cohérence : une distance routière ne peut pas être plus courte
 * que le vol d'oiseau. Une réponse qui l'affirme est erronée (mauvais point
 * géocodé, adresse homonyme dans une autre région) et sous-facturerait la
 * course — on préfère ne rien savoir et replier.
 */
export function distanceIsPlausible(
  roadKm: number,
  origin: LatLng | null,
  dest: LatLng | null,
): boolean {
  if (!origin || !dest) return true; // rien à comparer
  // 2 % de tolérance : les deux API n'arrondissent pas au même endroit.
  return roadKm >= haversineKm(origin, dest) * 0.98;
}
