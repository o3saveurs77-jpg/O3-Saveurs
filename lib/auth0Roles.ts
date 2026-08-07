/* Relecture du rôle réel d'un compte auprès d'Auth0.
 *
 * Le rôle arrive dans le token à la connexion, posé par l'Action Post-Login
 * (`auth0/actions/add-role-claim.js`). Mais le claim n'est fourni qu'à cette
 * connexion initiale : une fois la session ouverte, **retirer ADMIN dans Auth0
 * ne changeait plus rien**. La personne gardait l'accès au back-office aussi
 * longtemps qu'elle ne se déconnectait pas — c'est-à-dire potentiellement des
 * mois, une session JWT se renouvelant toute seule.
 *
 * Ce module va rechercher le rôle courant auprès de la Management API, à
 * intervalle régulier (voir `ROLE_TTL_MS` dans `auth.ts`). Auth0 reste la seule
 * source de vérité : la table `User` porte bien une colonne `role`, mais elle
 * n'est pas consultée ici — deux sources finiraient par diverger, et c'est
 * précisément sur un contrôle d'accès qu'on ne peut pas se le permettre.
 *
 * Nécessite les identifiants de l'application Machine to Machine
 * (`AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`, scope `read:roles`), ceux
 * que `npm run auth0:setup` utilise déjà. Ils doivent donc rester en place en
 * production, et non être supprimés après le provisionnement.
 */

import "server-only";

/** Rôles reconnus par l'application, dans l'ordre de priorité. */
const KNOWN_ROLES = ["ADMIN", "CLIENT"] as const;

/** Marge de sécurité avant l'expiration du jeton Management. */
const TOKEN_SKEW_MS = 60_000;

/** Regroupe les appels simultanés d'un même compte en une seule requête. */
const COALESCE_MS = 30_000;

let managementToken: { value: string; expiresAt: number } | null = null;
let missingCredentialsWarned = false;

const inFlight = new Map<string, { at: number; promise: Promise<string | null> }>();

function issuerUrl(): string | null {
  const raw = process.env.AUTH0_ISSUER?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.AUTH0_M2M_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) return { clientId, clientSecret };

  /* Averti une seule fois : sans ces identifiants la relecture est impossible
   * et un rôle retiré ne prendra effet qu'à la reconnexion. Le silence serait
   * pire — on croirait la révocation immédiate alors qu'elle ne l'est pas. */
  if (!missingCredentialsWarned) {
    missingCredentialsWarned = true;
    console.warn(
      "[auth0] AUTH0_M2M_CLIENT_ID/SECRET absentes : le rôle ne sera pas revérifié " +
        "en cours de session. Un rôle retiré dans Auth0 restera actif jusqu'à la " +
        "prochaine connexion de la personne concernée.",
    );
  }
  return null;
}

/** Jeton Management, mis en cache jusqu'à son expiration. */
async function getManagementToken(issuer: string): Promise<string | null> {
  if (managementToken && managementToken.expiresAt > Date.now() + TOKEN_SKEW_MS) {
    return managementToken.value;
  }

  const creds = credentials();
  if (!creds) return null;

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

  managementToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return managementToken.value;
}

async function requestRole(userId: string): Promise<string | null> {
  const issuer = issuerUrl();
  if (!issuer) return null;

  const token = await getManagementToken(issuer);
  if (!token) return null;

  const res = await fetch(
    `${issuer}/api/v2/users/${encodeURIComponent(userId)}/roles?per_page=100`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (res.status === 401) {
    // Jeton périmé côté Auth0 : on le jette pour le renouveler au prochain tour.
    managementToken = null;
    return null;
  }
  if (!res.ok) {
    console.error(`[auth0] lecture des rôles de ${userId} → ${res.status}`);
    return null;
  }

  const roles = (await res.json()) as { name?: string }[];
  const names = roles
    .map((r) => r.name)
    .filter((n): n is string => !!n)
    .map((n) => n.trim().toUpperCase());

  const fromRbac = KNOWN_ROLES.find((r) => names.includes(r));
  if (fromRbac) return fromRbac;

  /* RBAC ne donne rien. Deux cas très différents se cachent derrière :
   *
   *  · le rôle a réellement été retiré → il faut rétrograder ;
   *  · le tenant n'utilise pas RBAC et range les rôles dans `app_metadata` →
   *    c'est le repli que le trigger applique déjà à la connexion.
   *
   * Sans consulter `app_metadata` ici, le second cas donnait ADMIN à la
   * connexion puis CLIENT cinq minutes plus tard, indéfiniment : un rôle qui
   * clignote, bien pire qu'un rôle figé. Les deux chemins doivent lire les
   * mêmes sources, dans le même ordre. */
  const meta = await fetchAppMetadataRole(issuer, token, userId);
  return meta ?? "CLIENT";
}

/** Rôle éventuellement rangé dans `app_metadata.roles`, comme le lit le trigger. */
async function fetchAppMetadataRole(
  issuer: string,
  token: string,
  userId: string,
): Promise<string | null> {
  const res = await fetch(
    `${issuer}/api/v2/users/${encodeURIComponent(userId)}?fields=app_metadata&include_fields=true`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) return null;

  const body = (await res.json()) as { app_metadata?: { roles?: unknown } };
  const raw = body.app_metadata?.roles;
  if (!Array.isArray(raw)) return null;

  const names = raw
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim().toUpperCase());
  return KNOWN_ROLES.find((r) => names.includes(r)) ?? null;
}

/**
 * Rôle courant du compte Auth0, ou `null` si Auth0 n'a pas pu répondre.
 *
 * `null` ne veut **pas** dire « pas de rôle » : l'appelant doit conserver le
 * rôle qu'il avait plutôt que de rétrograder. Rétrograder sur une panne
 * réseau déconnecterait la gérante de son propre back-office au pire moment,
 * pendant un service.
 */
export async function fetchAuth0Role(userId: string): Promise<string | null> {
  const pending = inFlight.get(userId);
  if (pending && Date.now() - pending.at < COALESCE_MS) return pending.promise;

  const promise = requestRole(userId).catch((error) => {
    console.error("[auth0] relecture du rôle échouée:", error);
    return null;
  });

  inFlight.set(userId, { at: Date.now(), promise });

  // La carte ne doit pas grandir indéfiniment sur un serveur de longue durée.
  if (inFlight.size > 500) {
    const cutoff = Date.now() - COALESCE_MS;
    for (const [key, entry] of inFlight) {
      if (entry.at < cutoff) inFlight.delete(key);
    }
  }

  return promise;
}
