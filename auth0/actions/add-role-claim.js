// Auth0 Action - trigger "Login / Post Login".
//
// Pose le role de l'utilisateur dans les tokens, pour que auth.ts (callback
// jwt, next-auth) le lise a la connexion. Voir auth0/setup-m2m.ts, qui deploie
// ce fichier tel quel : c'est la source unique du code execute.
//
// ATTENTION - ce fichier part chez Auth0 et y est recompile. Deux regles :
//
//   1. ASCII uniquement. Une version anterieure, documentee en francais
//      accentue, a ete rejetee par Auth0 avec "ACTION_MALFORMED: Invalid
//      action code" : plus personne ne pouvait se connecter au site, et le
//      deploiement, lui, avait ete accepte sans broncher. Le detail des
//      intentions se raconte dans setup-m2m.ts, qui ne quitte jamais le depot.
//
//   2. Ne jamais laisser une exception s'echapper. Une erreur non rattrapee
//      dans un trigger Post-Login fait echouer la connexion de tout le monde,
//      clientes comprises. Au pire on accorde le role le moins privilegie.
//
// Le namespace doit rester identique a ROLE_CLAIM dans auth.ts.

const ROLE_CLAIM = "https://o3saveurs.fr/role";
const ROLES_CLAIM = "https://o3saveurs.fr/roles";
const KNOWN_ROLES = ["ADMIN", "CLIENT"];
const DEFAULT_ROLE = "CLIENT";

// Roles portes par le compte. RBAC d'abord ; app_metadata en repli, car
// event.authorization est absent quand RBAC n'est pas actif sur
// l'application - et retomber en silence sur CLIENT retirait alors son
// back-office a la gerante sans le moindre signe.
// Renvoie null quand aucune source n'est consultable : "aucun role" et "je
// n'ai pas pu savoir" ne se confondent pas.
function collectRoles(event) {
  const rbac = event && event.authorization && event.authorization.roles;
  if (Array.isArray(rbac)) return normalize(rbac);

  const meta = event && event.user && event.user.app_metadata && event.user.app_metadata.roles;
  if (Array.isArray(meta)) return normalize(meta);

  return null;
}

function normalize(roles) {
  const out = [];
  for (let i = 0; i < roles.length; i++) {
    const raw = roles[i];
    if (typeof raw !== "string") continue;
    const name = raw.trim().toUpperCase();
    if (name && out.indexOf(name) === -1) out.push(name);
  }
  return out;
}

exports.onExecutePostLogin = async (event, api) => {
  let role = DEFAULT_ROLE;
  let all = [];

  try {
    const assigned = collectRoles(event);
    if (assigned === null) {
      // Visible dans Auth0 > Monitoring > Logs : signale qu'il faut activer
      // RBAC sur l'application. Sans cette ligne la panne est muette.
      console.log("[add-role-claim] Aucune source de roles, role par defaut applique.");
    } else {
      all = assigned;
      for (let i = 0; i < KNOWN_ROLES.length; i++) {
        if (assigned.indexOf(KNOWN_ROLES[i]) !== -1) {
          role = KNOWN_ROLES[i];
          break;
        }
      }
    }
  } catch (error) {
    console.log("[add-role-claim] Echec du calcul du role: " + error);
  }

  try {
    api.idToken.setCustomClaim(ROLE_CLAIM, role);
    api.accessToken.setCustomClaim(ROLE_CLAIM, role);
    // Liste complete, pour qu'ajouter un role plus tard (LIVREUR, CUISINE)
    // ne demande pas de redeployer ce trigger.
    api.idToken.setCustomClaim(ROLES_CLAIM, all);
    api.accessToken.setCustomClaim(ROLES_CLAIM, all);
  } catch (error) {
    console.log("[add-role-claim] Impossible de poser le claim: " + error);
  }
};
