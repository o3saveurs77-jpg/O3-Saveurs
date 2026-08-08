/* Accès à la Management API d'Auth0 — jeton et appels.
 *
 * Extrait de `lib/auth0Roles.ts`, qui en était le seul client jusqu'à ce que
 * l'écran de gestion des rôles en ait besoin lui aussi. Deux copies du même
 * jeton mis en cache auraient doublé les appels à Auth0 et, surtout, doublé
 * les endroits où une erreur d'authentification pouvait se glisser.
 *
 * Tout est silencieux par construction : ces appels servent des écrans et des
 * contrôles d'accès qui doivent dégrader proprement, jamais faire tomber une
 * page. Les fonctions renvoient `null` plutôt que de lever.
 */

import "server-only";

/** Marge de sécurité avant l'expiration du jeton. */
const TOKEN_SKEW_MS = 60_000;

let cached: { value: string; expiresAt: number } | null = null;
let missingCredentialsWarned = false;

export function issuerUrl(): string | null {
  const raw = process.env.AUTH0_ISSUER?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.AUTH0_M2M_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return { clientId, clientSecret };

  if (!missingCredentialsWarned) {
    missingCredentialsWarned = true;
    console.warn(
      "[auth0] AUTH0_M2M_CLIENT_ID/SECRET absentes : la relecture des rôles et " +
        "l'écran de gestion des accès sont hors service.",
    );
  }
  return null;
}

/** Jeton Management, mis en cache jusqu'à son expiration. */
export async function managementToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + TOKEN_SKEW_MS) return cached.value;

  const issuer = issuerUrl();
  const creds = credentials();
  if (!issuer || !creds) return null;

  const res = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      audience: `${issuer}/api/v2/`,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(`[auth0] jeton Management refusé (${res.status})`);
    return null;
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;

  cached = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cached.value;
}

export interface ManagementResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Message exploitable par l'écran appelant — souvent un scope manquant. */
  error?: string;
}

/**
 * Appel authentifié à la Management API.
 *
 * Un 401 vide le cache : le jeton a pu être révoqué côté Auth0, et s'entêter
 * avec un jeton mort ferait échouer tous les appels suivants jusqu'à son
 * expiration théorique.
 */
export async function managementFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ManagementResult<T>> {
  const issuer = issuerUrl();
  const token = await managementToken();
  if (!issuer || !token) {
    return {
      ok: false,
      status: 503,
      data: null,
      error:
        "Auth0 n'est pas joignable : les identifiants Machine to Machine " +
        "(AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET) manquent ou sont refusés.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${issuer}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    console.error(`[auth0] ${init?.method ?? "GET"} ${path} injoignable:`, error);
    return { ok: false, status: 503, data: null, error: "Auth0 est injoignable." };
  }

  if (res.status === 401) cached = null;

  if (!res.ok) {
    const body = await res.text();
    console.error(`[auth0] ${init?.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 300)}`);
    /* 403 signifie presque toujours un scope non coché sur l'application M2M.
     * Le dire évite de chercher du côté du code pendant une heure. */
    const error =
      res.status === 403
        ? "Auth0 refuse cette opération : un scope manque sur l'application Machine to Machine."
        : `Auth0 a répondu ${res.status}.`;
    return { ok: false, status: res.status, data: null, error };
  }

  if (res.status === 204) return { ok: true, status: 204, data: null };
  return { ok: true, status: res.status, data: (await res.json()) as T };
}
