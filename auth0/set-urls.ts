/**
 * Recale les URL de l'application Auth0 sur le domaine public — `npm run auth0:urls`.
 *
 * Auth0 refuse toute redirection qui n'est pas déclarée à l'avance. Après un
 * changement de domaine, l'application est en ligne, la base répond, le
 * certificat est valide — et personne ne peut se connecter : Auth0 renvoie
 * `OAuthCallbackError`, sans dire lequel des trois champs est en cause. Ces
 * trois champs sont ici, dérivés d'une seule source, `NEXTAUTH_URL` :
 *
 *   · `callbacks`            — où Auth0 renvoie après authentification ;
 *   · `allowed_logout_urls`  — où il renvoie après déconnexion ;
 *   · `web_origins`          — quelles origines peuvent rafraîchir la session.
 *
 * Deux prudences, l'une et l'autre acquises de justesse :
 *
 *  · **Additif par défaut.** Le script ajoute le nouveau domaine sans retirer
 *    ce qui existe. Pendant une migration, l'ancienne adresse sert encore : la
 *    purger le jour où l'on bascule le DNS coupe la connexion sur le site
 *    encore en ligne, pendant les heures de propagation. `--nettoyer` ne
 *    garde que le domaine voulu — à passer une fois la bascule confirmée.
 *  · **Sans écriture par défaut.** Sans `--appliquer`, il affiche l'écart et
 *    ne touche à rien.
 *
 * Les entrées `localhost` sont conservées dans les deux cas : les retirer
 * casserait le développement local sans qu'on comprenne pourquoi, des semaines
 * plus tard.
 *
 * Usage :
 *   npm run auth0:urls                                  # montre l'écart
 *   npm run auth0:urls -- --appliquer                   # ajoute le domaine
 *   npm run auth0:urls -- --nettoyer --appliquer        # + purge l'ancien
 *   npm run auth0:urls -- --url=https://autre.fr --appliquer
 *
 * Préalable : `AUTH0_M2M_*` avec le scope `update:clients` (Dashboard →
 * Applications → [app M2M] → APIs → Auth0 Management API).
 */

try {
  process.loadEnvFile();
} catch {
  /* variables déjà présentes dans l'environnement */
}

const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const nettoyer = args.includes("--nettoyer");
const urlArg = args.find((a) => a.startsWith("--url="))?.slice("--url=".length);

const issuer = (process.env.AUTH0_ISSUER ?? "").trim().replace(/\/+$/, "");
const clientId = (process.env.AUTH0_CLIENT_ID ?? "").trim();

/** Origine publique du site, sans barre finale. */
const origine = (urlArg ?? process.env.NEXTAUTH_URL ?? "").trim().replace(/\/+$/, "");

/** Nom affiché sur l'écran de connexion Auth0 (Universal Login). */
const NOM_APPLI = "Ô 3 Saveurs";

/** Origine de développement, jamais retirée. */
const LOCAL = "http://localhost:3000";

if (!issuer || !clientId) {
  console.error("❌ AUTH0_ISSUER et AUTH0_CLIENT_ID sont requis.");
  process.exit(1);
}
if (!origine) {
  console.error("❌ NEXTAUTH_URL absente — impossible de savoir sur quel domaine recaler Auth0.");
  process.exit(1);
}
if (!origine.startsWith("https://")) {
  console.error(`❌ ${origine} n'est pas en HTTPS : Auth0 refuse les rappels en clair.`);
  process.exit(1);
}

/**
 * Variante `www` du domaine.
 *
 * `NEXTAUTH_URL` pointe sur l'apex, donc les rappels engendrés par NextAuth
 * aussi : en théorie `www` ne sert jamais. En pratique, si la redirection
 * `www → apex` de l'hébergeur tombe ou est configurée après coup, la connexion
 * casse pour les visiteurs qui ont tapé `www`. Deux lignes déclarées ici
 * coûtent moins qu'un diagnostic un soir de service.
 */
function avecWww(u: string): string | null {
  const h = new URL(u).hostname;
  if (h.startsWith("www.") || h.split(".").length > 2) return null;
  return u.replace("://", "://www.");
}

const www = avecWww(origine);
const origines = [origine, ...(www ? [www] : [])];

/** Ce que le domaine courant exige — le minimum, jamais le maximum. */
const cible = {
  callbacks: [...origines.map((o) => `${o}/api/auth/callback/auth0`), `${LOCAL}/api/auth/callback/auth0`],
  allowed_logout_urls: [...origines, LOCAL],
  web_origins: [...origines, LOCAL],
};

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

type Conf = { name?: string; callbacks?: string[]; allowed_logout_urls?: string[]; web_origins?: string[] };

const CHAMPS = ["callbacks", "allowed_logout_urls", "web_origins"] as const;

function ecart(avant: string[] = [], apres: string[] = []): { ajouts: string[]; retraits: string[] } {
  return {
    ajouts: apres.filter((v) => !avant.includes(v)),
    retraits: avant.filter((v) => !apres.includes(v)),
  };
}

async function main() {
  console.log(`Tenant   : ${issuer}`);
  console.log(`Client   : ${clientId}`);
  console.log(`Domaine  : ${origine}${www ? ` (+ ${www})` : ""}\n`);

  const t = await token();

  const res = await fetch(`${issuer}/api/v2/clients/${clientId}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error(`GET /clients/${clientId} → ${res.status} : ${await res.text()}`);
  const actuel = (await res.json()) as Conf;

  /* En mode additif, la cible est l'union avec l'existant : on n'enlève rien.
   * En mode `--nettoyer`, la cible fait foi telle quelle. */
  const voulu: Conf = { name: NOM_APPLI };
  for (const champ of CHAMPS) {
    voulu[champ] = nettoyer
      ? cible[champ]
      : [...(actuel[champ] ?? []), ...cible[champ].filter((v) => !(actuel[champ] ?? []).includes(v))];
  }

  console.log(nettoyer ? "Mode : nettoyage (purge des URL hors domaine)\n" : "Mode : additif\n");

  let change = actuel.name !== voulu.name;
  if (change) console.log(`nom : « ${actuel.name} » → « ${voulu.name} »\n`);

  for (const champ of CHAMPS) {
    const { ajouts, retraits } = ecart(actuel[champ], voulu[champ]);
    if (!ajouts.length && !retraits.length) {
      console.log(`${champ} : déjà correct`);
      continue;
    }
    change = true;
    console.log(`${champ} :`);
    for (const v of retraits) console.log(`  − ${v}`);
    for (const v of ajouts) console.log(`  + ${v}`);
  }

  if (!change) {
    console.log("\n✅ Rien à faire, Auth0 est déjà aligné sur le domaine.");
    return;
  }

  if (!appliquer) {
    console.log("\nRien n'a été écrit. Relancer avec --appliquer pour valider.");
    return;
  }

  if (nettoyer) {
    const perdues = CHAMPS.flatMap((c) => ecart(actuel[c], voulu[c]).retraits);
    if (perdues.length) {
      console.log(
        `\n⚠ ${perdues.length} adresse(s) retirée(s) : toute connexion venant de là cessera immédiatement.`,
      );
    }
  }

  const patch = await fetch(`${issuer}/api/v2/clients/${clientId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(voulu),
  });
  if (!patch.ok) {
    throw new Error(
      `PATCH /clients/${clientId} → ${patch.status} : ${await patch.text()}\n` +
        "Scope `update:clients` manquant sur l'application M2M ?",
    );
  }

  console.log("\n✅ Auth0 recalé. Se déconnecter puis se reconnecter pour vérifier.");
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

/* Un fichier sans import ni export est un script global aux yeux de
 * TypeScript : ses `issuer`, `token()` et `main()` vivraient dans la même
 * portée que ceux de `diagnose.ts`, qui n'importe rien non plus, et `tsc`
 * refuserait les deux pour redéclaration. Une exportation vide suffit à en
 * faire un module. */
export {};
