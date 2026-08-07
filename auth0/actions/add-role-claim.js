/**
 * Action Auth0 — trigger « Login / Post Login ».
 *
 * Pose le rôle de l'utilisateur dans le token d'identité et le token d'accès,
 * pour que `auth.ts` (callback `jwt`, next-auth) le lise à la connexion sans
 * interroger la base applicative.
 *
 * Ce fichier est la **source unique** du code déployé : `auth0/setup-m2m.ts` le
 * lit et l'envoie tel quel à la Management API (`npm run auth0:setup`). Il n'y
 * a donc plus de copie du code dans le script — deux exemplaires d'un contrôle
 * d'accès finissent toujours par diverger, et c'est la copie périmée qui gagne
 * au déploiement suivant.
 *
 * ── Deux règles de conduite, qui expliquent la forme du code ────────────────
 *
 * 1. **Ne jamais empêcher une connexion.** Une exception non rattrapée dans une
 *    Action Post-Login fait échouer le login — pour *tout le monde*, clientes
 *    comprises, et sans autre message qu'un écran d'erreur Auth0. Une faute de
 *    frappe ici fermerait donc le site entier. Tout est sous `try` et, au pire,
 *    on pose le rôle le moins privilégié plutôt que de bloquer.
 *
 * 2. **Ne jamais rétrograder en silence.** L'absence de rôle et l'absence
 *    d'information sont deux choses différentes : `event.authorization` est
 *    `undefined` quand RBAC n'est pas activé sur l'application, et l'ancienne
 *    version retombait alors sur CLIENT sans rien dire. La gérante perdait son
 *    accès au back-office et rien, nulle part, n'indiquait pourquoi. Ce cas est
 *    maintenant distingué, journalisé, et rattrapé par `app_metadata`.
 *
 * ── Mise en place ──────────────────────────────────────────────────────────
 *
 * Automatique : `npm run auth0:setup` crée les rôles, déploie cette Action et
 * la branche au flow Login. C'est la voie recommandée.
 *
 * À la main (Auth0 Dashboard), si besoin :
 *   1. User Management → Roles → Create Role : « ADMIN », puis « CLIENT ».
 *   2. User Management → Users → [compte de Laila] → Roles → Assign : ADMIN.
 *      Ne rien assigner aux autres comptes : ils restent CLIENT.
 *   3. Actions → Library → Build Custom → nom « Add role claim »,
 *      trigger « Login / Post Login » → coller ce fichier → Deploy.
 *   4. Actions → Flows → Login → glisser l'action dans le flow → Apply.
 *   5. Vérifier que RBAC est activé pour l'application, sinon
 *      `event.authorization` restera vide (voir règle 2 ci-dessus).
 *
 * Le namespace ci-dessous doit rester identique à `ROLE_CLAIM` dans `auth.ts` :
 * la spécification OIDC impose un claim personnalisé sous forme d'URI
 * namespacée, un nom court comme « role » serait ignoré par Auth0.
 */

const ROLE_CLAIM = "https://o3saveurs.fr/role";
const ROLES_CLAIM = "https://o3saveurs.fr/roles";

/** Du plus privilégié au moins privilégié — le premier trouvé l'emporte. */
const KNOWN_ROLES = ["ADMIN", "CLIENT"];
const DEFAULT_ROLE = "CLIENT";

/**
 * Rôles portés par le compte, quelle que soit leur provenance.
 *
 * `event.authorization.roles` est la source normale (RBAC). `app_metadata.roles`
 * sert de filet quand RBAC n'est pas activé : sans lui, une case décochée dans
 * la configuration de l'application suffirait à retirer son back-office à la
 * gérante, sans le moindre signe avant-coureur.
 *
 * Renvoie `null` — et non un tableau vide — quand aucune source n'a pu être
 * consultée : « aucun rôle » et « je n'ai pas pu savoir » ne se confondent pas.
 */
function collectRoles(event) {
  const fromRbac = event.authorization && event.authorization.roles;
  if (Array.isArray(fromRbac)) return normalize(fromRbac);

  const fromMetadata = event.user && event.user.app_metadata && event.user.app_metadata.roles;
  if (Array.isArray(fromMetadata)) return normalize(fromMetadata);

  return null;
}

/** Uniformise la casse et écarte tout ce qui n'est pas une chaîne exploitable. */
function normalize(roles) {
  const out = [];
  for (const raw of roles) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().toUpperCase();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

exports.onExecutePostLogin = async (event, api) => {
  let role = DEFAULT_ROLE;
  let all = [];

  try {
    const assigned = collectRoles(event);

    if (assigned === null) {
      /* Visible dans Auth0 → Monitoring → Logs. C'est le signal qu'il faut
         activer RBAC sur l'application, ou mirrorer les rôles dans
         app_metadata. Sans cette ligne, la panne est parfaitement muette. */
      console.log(
        "[add-role-claim] Aucune source de rôles pour " +
          (event.user && event.user.user_id) +
          " : RBAC désactivé sur l'application ? Rôle rétrogradé en " +
          DEFAULT_ROLE +
          ".",
      );
    } else {
      all = assigned;
      role = KNOWN_ROLES.find((r) => assigned.includes(r)) || DEFAULT_ROLE;
    }
  } catch (error) {
    // Règle 1 : on n'empêche pas la connexion, on rend le moins de droits.
    console.log("[add-role-claim] Échec du calcul du rôle : " + error);
  }

  try {
    api.idToken.setCustomClaim(ROLE_CLAIM, role);
    api.accessToken.setCustomClaim(ROLE_CLAIM, role);

    /* La liste complète, pour qu'ajouter un rôle plus tard (LIVREUR, CUISINE…)
       ne demande pas de retoucher — ni de redéployer — ce trigger. */
    api.idToken.setCustomClaim(ROLES_CLAIM, all);
    api.accessToken.setCustomClaim(ROLES_CLAIM, all);
  } catch (error) {
    console.log("[add-role-claim] Impossible de poser le claim : " + error);
  }
};
