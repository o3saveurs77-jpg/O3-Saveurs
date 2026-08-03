/* Limitation de débit.
 *
 * Il n'y en avait aucune : bruteforce illimité sur la connexion, création
 * massive de comptes, et surtout inondation possible de la création de commande,
 * qui déclenche un email Resend à chaque appel — de quoi épuiser le quota et
 * faire blacklister le domaine expéditeur du restaurant.
 *
 * Implémentation en mémoire, volontairement simple. Limite connue : sur Vercel,
 * chaque instance de fonction a son propre compteur, donc la limite réelle est
 * multipliée par le nombre d'instances actives. C'est suffisant pour arrêter un
 * script naïf, pas une attaque distribuée. Pour une vraie protection, brancher
 * Vercel KV ou Upstash Redis en remplaçant `hit()` — la signature ne change pas.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Purge paresseuse : évite que la table grossisse indéfiniment. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** secondes avant réinitialisation, pour l'en-tête `Retry-After` */
  retryAfter: number;
}

/**
 * Consomme un jeton pour `key`.
 * @param limit  nombre d'appels autorisés dans la fenêtre
 * @param windowMs durée de la fenêtre en millisecondes
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);

  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter,
  };
}

/**
 * Identifie l'appelant. Sur Vercel, `x-forwarded-for` est renseigné par la
 * plateforme ; en local il est absent, d'où le repli.
 */
export function clientKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

/** Réponse 429 normalisée, avec `Retry-After`. */
export function tooManyRequests(result: RateLimitResult, message?: string): Response {
  return new Response(
    JSON.stringify({
      error: message ?? `Trop de tentatives. Réessayez dans ${result.retryAfter} secondes.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter),
      },
    },
  );
}

/** Barèmes par usage, pour ne pas les disperser dans les routes. */
export const LIMITS = {
  /** Connexion : le bruteforce est le risque principal. */
  login: { limit: 8, windowMs: 10 * 60_000 },
  /** Création de compte. */
  register: { limit: 5, windowMs: 60 * 60_000 },
  /** Commande : chaque appel envoie des emails. */
  checkout: { limit: 12, windowMs: 10 * 60_000 },
  /** Formulaire de contact et réclamations. */
  contact: { limit: 5, windowMs: 60 * 60_000 },
  /** Inscription newsletter. */
  newsletter: { limit: 5, windowMs: 60 * 60_000 },
  /** Vérification d'un code promo (évite l'énumération de codes). */
  promoCheck: { limit: 20, windowMs: 10 * 60_000 },
  /**
   * Autocomplétion d'adresse. Chaque appel est **facturé par Google** : sans
   * limite, un script transformerait la recherche d'adresse en note de frais.
   * Généreux malgré tout — un client qui saisit son adresse déclenche plusieurs
   * requêtes en quelques secondes.
   */
  addressSuggest: { limit: 40, windowMs: 5 * 60_000 },
  /** Estimation des frais de livraison (appel Distance Matrix, facturé aussi). */
  deliveryQuote: { limit: 30, windowMs: 10 * 60_000 },
} as const;
