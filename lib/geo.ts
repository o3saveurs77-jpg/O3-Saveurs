import "server-only";

import { haversineKm } from "@/lib/delivery";
import { extractZip } from "@/lib/zones";

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

/** Point de livraison tel que Google le comprend. */
interface GeocodedPlace extends LatLng {
  zip: string | null;
  city: string | null;
  /** Faux quand Google n'a trouvé qu'un à-peu-près : la commune, ou une partie de la saisie. */
  precise: boolean;
}

const placeCache = new Map<string, GeocodedPlace>();

/**
 * Géocode la destination : par son `place_id` quand le client a choisi une
 * suggestion, sinon par le texte saisi.
 */
async function geocodeDestination(dest: {
  placeId?: string | null;
  address?: string | null;
}): Promise<GeocodedPlace | null> {
  const params = new URLSearchParams({ key: KEY(), language: "fr", region: "fr" });
  if (dest.placeId) params.set("place_id", dest.placeId);
  else if (dest.address?.trim()) params.set("address", dest.address.trim());
  else return null;

  const cacheKey = dest.placeId ? `p:${dest.placeId}` : `a:${dest.address!.trim().toLowerCase()}`;
  const cached = placeCache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!data || data.status !== "OK") return null;

  const first = (Array.isArray(data.results) ? data.results[0] : undefined) as
    | {
        partial_match?: boolean;
        geometry?: { location?: LatLng; location_type?: string };
        address_components?: { long_name?: string; types?: string[] }[];
      }
    | undefined;
  const loc = first?.geometry?.location;
  if (!first || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;

  const part = (type: string) =>
    first.address_components?.find((c) => c.types?.includes(type))?.long_name ?? null;

  return remember(placeCache, cacheKey, {
    lat: loc.lat,
    lng: loc.lng,
    zip: part("postal_code"),
    city: part("locality"),
    /* Une suggestion choisie dans la liste désigne une adresse exacte. Une
     * saisie libre, elle, peut n'être reconnue qu'en partie — Google se rabat
     * alors sur le centre de la commune, et la distance mesurée ne dit plus
     * rien du trajet réel. */
    precise:
      !!dest.placeId ||
      (!first.partial_match && first.geometry?.location_type !== "APPROXIMATE"),
  });
}

export type DeliveryMeasure =
  /** Distance mesurée et vérifiée : c'est elle qui facture. */
  | { kind: "ok"; km: number }
  /** Pas de mesure fiable (API muette, adresse floue, résultat incohérent) : replier sur les zones. */
  | { kind: "unknown" }
  /** L'adresse et le code postal saisis désignent deux endroits différents. */
  | { kind: "zip_mismatch"; zip: string; city: string | null };

/**
 * Distance de livraison **vérifiée** — le seul point d'entrée de la facturation
 * à la distance.
 *
 * La distance routière seule ne suffisait pas. Trois façons de facturer une
 * course au mauvais palier passaient sans bruit :
 *
 *  · **Adresse et code postal discordants** — le client choisit une
 *    suggestion puis retouche le code postal, ou l'inverse. Le tarif était
 *    calculé sur l'une, le livreur envoyé vers l'autre ;
 *  · **Saisie floue** — une rue inconnue de Google était ramenée au centre de
 *    la commune, et facturée comme telle ;
 *  · **Point aberrant** — une rue homonyme dans une autre région donnait une
 *    distance routière plus courte que le vol d'oiseau. `distanceIsPlausible`
 *    existait pour ça, mais n'était appelé nulle part.
 *
 * Seule la discordance est un refus : c'est une erreur de saisie que le client
 * peut corriger. Les deux autres replient sur les zones, comme une panne.
 */
export async function measureDelivery(
  origin: LatLng,
  dest: { placeId?: string | null; address?: string | null; zip?: string | null },
): Promise<DeliveryMeasure> {
  if (!isGeoConfigured()) return { kind: "unknown" };

  const place = await geocodeDestination(dest);
  if (!place) return { kind: "unknown" };

  const typedZip = extractZip(dest.zip ?? "");
  if (typedZip && place.zip && typedZip !== place.zip) {
    return { kind: "zip_mismatch", zip: place.zip, city: place.city };
  }
  if (!place.precise) return { kind: "unknown" };

  // Le trajet est mesuré vers le point vérifié ci-dessus, pas vers le texte
  // brut : les deux mesures portent ainsi sur le même endroit.
  const km = await roadDistanceKm(origin, {
    placeId: dest.placeId ?? null,
    address: `${place.lat},${place.lng}`,
  });
  if (km === null) return { kind: "unknown" };

  if (!distanceIsPlausible(km, origin, place)) {
    console.warn(
      `[geo] distance incohérente écartée : ${km} km par la route, ${haversineKm(origin, place).toFixed(2)} km à vol d'oiseau.`,
    );
    return { kind: "unknown" };
  }
  return { kind: "ok", km };
}

/** Message affiché au client quand l'adresse et le code postal se contredisent. */
export function zipMismatchMessage(m: { zip: string; city: string | null }): string {
  return `Le code postal ne correspond pas à cette adresse, que nous situons au ${m.zip}${
    m.city ? ` ${m.city}` : ""
  }. Corrigez le code postal, ou choisissez l'adresse dans la liste proposée.`;
}
