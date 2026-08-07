/**
 * Provisionne le rôle Auth0 (Roles + Action Post-Login) via la Management API,
 * au lieu de cliquer dans le dashboard — voir `auth0/actions/add-role-claim.js`
 * pour le détail de ce que ça remplace.
 *
 * Idempotent : relançable sans dupliquer les rôles, l'action ou le binding.
 *
 * Préalable (dashboard Auth0, une fois) :
 *   1. Applications → Create Application → Machine to Machine.
 *   2. Autoriser cette appli pour l'API "Auth0 Management API", avec les scopes :
 *        read:roles create:roles read:users
 *        create:role_members read:role_members
 *        read:actions create:actions update:actions
 *        read:triggers update:triggers
 *      (l'écran d'autorisation liste les scopes disponibles — cocher ceux-ci ;
 *      un scope manquant apparaît clairement dans l'erreur 403 renvoyée ici.)
 *   3. Ajouter dans `.env` :
 *        AUTH0_M2M_CLIENT_ID="..."
 *        AUTH0_M2M_CLIENT_SECRET="..."
 *      (AUTH0_ISSUER doit déjà pointer sur le vrai domaine du tenant.)
 *   4. Se connecter une fois sur le site avec le compte ADMIN_EMAIL, pour que
 *      l'utilisateur existe côté Auth0 (ce script ne crée pas de compte).
 *
 * Usage : npm run auth0:setup
 *
 * ⚠ Ne pas supprimer l'application M2M après coup, contrairement à ce que cette
 * note conseillait : `lib/auth0Roles.ts` s'en sert **en production** pour relire
 * le rôle en cours de session (scope `read:roles`). Sans elle, un rôle retiré
 * dans Auth0 resterait actif jusqu'à la reconnexion de la personne. Les deux
 * variables `AUTH0_M2M_*` doivent donc être présentes dans l'environnement de
 * déploiement, au même titre que `AUTH0_CLIENT_*`.
 */

import { readFileSync } from "node:fs";

try {
  process.loadEnvFile(); // charge .env — ce script tourne hors Next.js/Prisma
} catch {
  /* pas de .env local (ex. CI) : les variables viennent déjà de l'environnement */
}

const ACTION_NAME = "Add role claim";

/**
 * Code déployé, lu depuis `auth0/actions/add-role-claim.js`.
 *
 * Ce script en portait auparavant sa **propre copie**, dans un littéral de
 * gabarit. Les deux exemplaires avaient déjà divergé : relancer
 * `npm run auth0:setup` réécrasait le trigger déployé avec la version périmée
 * du script, silencieusement. Un contrôle d'accès n'a qu'une source.
 */
function actionCode(): string {
  const file = new URL("./actions/add-role-claim.js", import.meta.url);
  const code = readFileSync(file, "utf8").trim();
  if (!code.includes("onExecutePostLogin")) {
    throw new Error(
      "auth0/actions/add-role-claim.js ne définit pas onExecutePostLogin — " +
        "déploiement interrompu pour ne pas casser la connexion au site.",
    );
  }
  return code;
}

function env(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`${key} manquante dans l'environnement.`);
  return v;
}

const issuer = env("AUTH0_ISSUER").replace(/\/+$/, "");
const domain = issuer.replace(/^https?:\/\//, "");

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${issuer}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}\n${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function getManagementToken(): Promise<string> {
  const res = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env("AUTH0_M2M_CLIENT_ID"),
      client_secret: env("AUTH0_M2M_CLIENT_SECRET"),
      audience: `${issuer}/api/v2/`,
    }),
  });
  if (!res.ok) throw new Error(`Échec du token M2M (${res.status}) : ${await res.text()}`);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

interface Role {
  id: string;
  name: string;
}

async function ensureRole(token: string, name: string): Promise<Role> {
  const existing = await api<Role[]>(token, `/api/v2/roles?name_filter=${encodeURIComponent(name)}`);
  const found = existing.find((r) => r.name === name);
  if (found) {
    console.log(`  · rôle "${name}" déjà présent (${found.id})`);
    return found;
  }
  const created = await api<Role>(token, "/api/v2/roles", {
    method: "POST",
    body: JSON.stringify({ name, description: `Rôle ${name} — Ô 3 Saveurs` }),
  });
  console.log(`  · rôle "${name}" créé (${created.id})`);
  return created;
}

async function assignAdminRole(token: string, roleId: string, email: string) {
  const users = await api<{ user_id: string }[]>(
    token,
    `/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
  );
  if (users.length === 0) {
    throw new Error(
      `Aucun utilisateur Auth0 pour ${email}. Il doit s'être connecté au moins une ` +
        `fois via le site (Universal Login) avant que ce script puisse lui assigner le rôle.`,
    );
  }
  const userId = users[0].user_id;
  await api(token, `/api/v2/users/${encodeURIComponent(userId)}/roles`, {
    method: "POST",
    body: JSON.stringify({ roles: [roleId] }),
  });
  console.log(`  · rôle ADMIN assigné à ${email} (${userId})`);
}

interface ActionResource {
  id: string;
  name: string;
  deployed_version?: { id: string };
}

async function ensureAction(token: string): Promise<ActionResource> {
  const code = actionCode();
  const existing = await api<{ actions: ActionResource[] }>(
    token,
    "/api/v2/actions/actions?triggerId=post-login&per_page=100",
  );
  const found = existing.actions.find((a) => a.name === ACTION_NAME);

  if (found) {
    await api(token, `/api/v2/actions/actions/${found.id}`, {
      method: "PATCH",
      body: JSON.stringify({ code }),
    });
    console.log(`  · action "${ACTION_NAME}" mise à jour (${found.id})`);
    return found;
  }

  const created = await api<ActionResource>(token, "/api/v2/actions/actions", {
    method: "POST",
    body: JSON.stringify({
      name: ACTION_NAME,
      supported_triggers: [{ id: "post-login", version: "v3" }],
      code,
      runtime: "node18",
    }),
  });
  console.log(`  · action "${ACTION_NAME}" créée (${created.id})`);
  return created;
}

async function deployAction(token: string, actionId: string) {
  await api(token, `/api/v2/actions/actions/${actionId}/deploy`, { method: "POST" });
  console.log(`  · action déployée`);
}

interface Bindings {
  bindings: { id?: string; ref: { type: string; value: string }; display_name: string }[];
}

async function ensureBinding(token: string, actionId: string) {
  const current = await api<Bindings>(token, "/api/v2/actions/triggers/post-login/bindings");
  const already = current.bindings.some((b) => b.ref.value === actionId);
  if (already) {
    console.log(`  · déjà présente dans le flow Login`);
    return;
  }
  await api(token, "/api/v2/actions/triggers/post-login/bindings", {
    method: "PATCH",
    body: JSON.stringify({
      bindings: [
        ...current.bindings.map((b) => ({ ref: b.ref, display_name: b.display_name })),
        { ref: { type: "action_id", value: actionId }, display_name: ACTION_NAME },
      ],
    }),
  });
  console.log(`  · ajoutée au flow Login`);
}

async function main() {
  console.log(`🔐 Provisionnement Auth0 sur ${domain}\n`);

  const token = await getManagementToken();

  console.log("Rôles :");
  const adminRole = await ensureRole(token, "ADMIN");
  await ensureRole(token, "CLIENT");

  console.log("\nAssignation :");
  await assignAdminRole(token, adminRole.id, env("ADMIN_EMAIL").toLowerCase());

  console.log("\nAction Post-Login :");
  const action = await ensureAction(token);
  await deployAction(token, action.id);
  await ensureBinding(token, action.id);

  console.log("\n✅ Terminé. Le rôle sera dans le token à la prochaine connexion.");
}

main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
