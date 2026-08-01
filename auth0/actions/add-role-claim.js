/**
 * Action Auth0 — trigger "Login / Post Login".
 *
 * Pose le rôle de l'utilisateur (assigné via Auth0 Roles) dans le token, pour
 * que `auth.ts` (callback `jwt`, next-auth) puisse le lire sans jamais
 * interroger la base applicative. Doit être installée manuellement — Auth0 ne
 * lit pas ce fichier depuis le repo, il faut le coller dans le dashboard.
 *
 * Mise en place (Auth0 Dashboard) :
 *
 * 1. User Management → Roles → Create Role
 *    - "ADMIN"
 *    - "CLIENT"   (optionnel : par défaut, tout utilisateur sans rôle assigné
 *                  est traité comme CLIENT par cette Action)
 *
 * 2. User Management → Users → [le compte de Laila] → onglet "Roles" →
 *    Assign Roles → ADMIN.
 *    Ne pas assigner de rôle aux autres comptes : ils resteront CLIENT.
 *
 * 3. Actions → Library → Build Custom → Name: "Add role claim",
 *    Trigger: "Login / Post Login" → coller le code ci-dessous → Deploy.
 *
 * 4. Actions → Flows → Login → glisser "Add role claim" dans le flow (après
 *    les étapes par défaut) → Apply.
 *
 * Le namespace `https://o3saveurs.fr/role` ci-dessous doit rester identique à
 * `ROLE_CLAIM` dans `auth.ts` — Auth0 exige un claim custom sous forme d'URI
 * namespacée (spec OIDC : un nom court comme "role" serait ignoré).
 */

const ROLE_CLAIM = "https://o3saveurs.fr/role";
const KNOWN_ROLES = ["ADMIN", "CLIENT"];

exports.onExecutePostLogin = async (event, api) => {
  const assigned = event.authorization?.roles ?? [];
  const role = KNOWN_ROLES.find((r) => assigned.includes(r)) ?? "CLIENT";

  api.idToken.setCustomClaim(ROLE_CLAIM, role);
  api.accessToken.setCustomClaim(ROLE_CLAIM, role);
};
