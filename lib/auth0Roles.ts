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
 * Le jeton Management et les appels vivent dans `lib/auth0Management.ts`, que
 * l'écran « Accès & rôles » partage : un seul cache, un seul endroit où une
 * erreur d'authentification peut se glisser.
 */

import "server-only";

import { managementFetch } from "@/lib/auth0Management";

/** Rôles reconnus par l'application, dans l'ordre de priorité. */
const KNOWN_ROLES = ["ADMIN", "LIVREUR", "CLIENT"] as const;

/** Regroupe les appels simultanés d'un même compte en une seule requête. */
const COALESCE_MS = 30_000;

const inFlight = new Map<string, { at: number; promise: Promise<string | null> }>();

async function requestRole(userId: string): Promise<string | null> {
  const res = await managementFetch<{ name?: string }[]>(
    `/api/v2/users/${encodeURIComponent(userId)}/roles?per_page=100`,
  );
  if (!res.ok || !res.data) return null;

  const names = res.data
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
  const meta = await fetchAppMetadataRole(userId);
  return meta ?? "CLIENT";
}

/** Rôle éventuellement rangé dans `app_metadata.roles`, comme le lit le trigger. */
async function fetchAppMetadataRole(userId: string): Promise<string | null> {
  const res = await managementFetch<{ app_metadata?: { roles?: unknown } }>(
    `/api/v2/users/${encodeURIComponent(userId)}?fields=app_metadata&include_fields=true`,
  );
  if (!res.ok || !res.data) return null;

  const raw = res.data.app_metadata?.roles;
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
