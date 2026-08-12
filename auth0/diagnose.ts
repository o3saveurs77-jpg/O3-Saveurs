/**
 * Diagnostic Auth0 — **lecture seule**, n'écrit rien sur le tenant.
 *
 * Usage : npm run auth0:check
 *
 * Répond à la question « pourquoi je n'ai pas le back-office ? » sans avoir à
 * fouiller le dashboard. Vérifie, dans l'ordre où ça casse :
 *
 *   · les rôles ADMIN / CLIENT existent-ils ;
 *   · l'Action Post-Login est-elle déployée et **à jour** ;
 *   · est-elle réellement branchée au flow Login (déployée mais non branchée
 *     = elle ne s'exécute jamais, et rien ne le signale) ;
 *   · quel code est effectivement exécuté, et quels claims il pose ;
 *   · le compte ADMIN_EMAIL porte-t-il le rôle, en RBAC ou en app_metadata.
 *
 * Quand tout est vert ici mais que le back-office reste inaccessible, c'est le
 * jeton de session qui est périmé : se déconnecter puis se reconnecter suffit.
 */
try {
  process.loadEnvFile();
} catch {
  /* variables déjà dans l'environnement */
}

const issuer = (process.env.AUTH0_ISSUER ?? "").trim().replace(/\/+$/, "");
const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

async function token(): Promise<string> {
  const res = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.AUTH0_M2M_CLIENT_ID,
      client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
      audience: `${issuer}/api/v2/`,
    }),
  });
  if (!res.ok) throw new Error(`token M2M ${res.status} : ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function get<T>(t: string, path: string): Promise<T> {
  const res = await fetch(`${issuer}${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} : ${await res.text()}`);
  return (await res.json()) as T;
}

/** Scopes dont dépendent la relecture des rôles et l'écran « Accès & rôles ». */
const SCOPES_REQUIS = [
  "read:users",
  "read:roles",
  "read:role_members",
  "create:role_members",
  "delete:role_members",
];

/** Les scopes accordés sont inscrits dans le jeton lui-même. */
function checkScopes(t: string) {
  let accordes: string[] = [];
  try {
    const payload = JSON.parse(Buffer.from(t.split(".")[1], "base64").toString("utf8")) as {
      scope?: string;
    };
    accordes = (payload.scope ?? "").split(" ").filter(Boolean);
  } catch {
    console.log("\nSCOPES : jeton illisible.");
    return;
  }

  const manquants = SCOPES_REQUIS.filter((s) => !accordes.includes(s));
  console.log(`\nSCOPES M2M : ${manquants.length === 0 ? "complets ✅" : "INCOMPLETS ⚠"}`);
  for (const s of SCOPES_REQUIS) {
    console.log(`  ${accordes.includes(s) ? "·" : "⚠"} ${s}${accordes.includes(s) ? "" : "  ABSENT"}`);
  }
  if (manquants.length) {
    console.log(
      "  → Dashboard → Applications → [app M2M] → APIs → Auth0 Management API → cocher ces scopes.",
    );
  }
}

async function main() {
  console.log(`Tenant : ${issuer}`);
  console.log(`ADMIN_EMAIL : ${adminEmail}\n`);
  const t = await token();
  checkScopes(t);

  const roles = await get<{ id: string; name: string }[]>(t, "/api/v2/roles?per_page=100");
  console.log(`RÔLES (${roles.length}) :`);
  for (const r of roles) console.log(`  · ${r.name} (${r.id})`);
  if (!roles.length) console.log("  ⚠ aucun rôle créé — `npm run auth0:setup` n'a jamais tourné ?");

  const actions = await get<{ actions: { id: string; name: string; deployed_version?: { id: string } | null; all_changes_deployed?: boolean }[] }>(
    t,
    "/api/v2/actions/actions?triggerId=post-login&per_page=100",
  );
  console.log(`\nACTIONS post-login (${actions.actions.length}) :`);
  for (const a of actions.actions) {
    console.log(
      `  · ${a.name} — déployée : ${a.deployed_version ? "oui" : "NON"} · à jour : ${a.all_changes_deployed ? "oui" : "NON"}`,
    );
  }
  if (!actions.actions.length) console.log("  ⚠ aucune action : le claim de rôle n'est jamais posé.");

  console.log("\nIdentifiants des actions (noms exacts entre chevrons) :");
  for (const a of actions.actions) console.log(`  · «${a.name}» → ${a.id}`);

  const bindings = await get<{
    bindings: { display_name: string; action?: { id: string; name: string } }[];
  }>(t, "/api/v2/actions/triggers/post-login/bindings");
  console.log(`\nFLOW LOGIN (${bindings.bindings.length} étape(s)) :`);
  for (const b of bindings.bindings) {
    console.log(`  · «${b.display_name}» → action ${b.action?.id ?? "?"}`);
  }
  if (!bindings.bindings.length) {
    console.log("  ⚠ flow vide : même déployée, l'action ne s'exécute pas.");
  }

  // Le code réellement exécuté à chaque connexion : c'est lui qui fait foi.
  for (const b of bindings.bindings) {
    if (!b.action?.id) continue;
    const full = await get<{ code: string }>(t, `/api/v2/actions/actions/${b.action.id}`);
    const claims = [...full.code.matchAll(/https:\/\/[^"']+/g)].map((m) => m[0]);
    console.log(`\nCODE EXÉCUTÉ (action ${b.action.id}) :`);
    console.log(`  namespaces posés : ${claims.join(", ") || "AUCUN ⚠"}`);
    console.log(`  gère app_metadata : ${full.code.includes("app_metadata") ? "oui" : "non"}`);
    console.log(`  longueur : ${full.code.length} caractères`);
  }

  if (adminEmail) {
    const users = await get<{ user_id: string; email: string; app_metadata?: Record<string, unknown> }[]>(
      t,
      `/api/v2/users-by-email?email=${encodeURIComponent(adminEmail)}`,
    );
    console.log(`\nCOMPTE ${adminEmail} : ${users.length} trouvé(s)`);
    for (const u of users) {
      const mine = await get<{ name: string }[]>(
        t,
        `/api/v2/users/${encodeURIComponent(u.user_id)}/roles`,
      );
      console.log(`  · ${u.user_id}`);
      console.log(`      rôles RBAC : ${mine.map((r) => r.name).join(", ") || "AUCUN ⚠"}`);
      console.log(`      app_metadata.roles : ${JSON.stringify(u.app_metadata?.roles ?? null)}`);
    }
    if (!users.length) console.log("  ⚠ ce compte ne s'est jamais connecté au site.");
  }
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
