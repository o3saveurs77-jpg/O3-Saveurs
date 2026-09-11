/* Refuse d'exécuter une commande destructrice sur la base de production.
 *
 * Depuis le 3 septembre 2026, `.env` ne pointe plus sur Neon mais sur la base
 * Clever Cloud du restaurant : `npm run db:reset` détruirait les commandes, les
 * factures et le catalogue réels, sans confirmation, et `db:seed` les
 * écraserait. Ces commandes étaient inoffensives tant qu'une base de dev
 * existait ; elles ne le sont plus. Voir l'audit du 11 septembre 2026.
 *
 * En `.mjs` et sans dépendance, volontairement : ce garde-fou tourne *avant*
 * tsx et avant Prisma, il ne doit rien exiger pour fonctionner. Il lit donc
 * lui-même les fichiers d'environnement, dans l'ordre où Prisma les lirait.
 *
 * Sortie 0 = la commande appelante peut continuer. Sortie 1 = elle est refusée.
 */
import { existsSync, readFileSync } from "node:fs";

const HOTES_DE_PRODUCTION = ["clever-cloud"];
const ECHAPPATOIRE = "OUI_JE_DETRUIS_LA_BASE_DE_PRODUCTION";

const commande = process.argv[2] ?? "cette commande";

/** L'URL que verrait Prisma : l'environnement d'abord, puis les fichiers. */
function urlDeLaBase() {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, source: "l'environnement" };

  for (const fichier of [".env.production.local", ".env"]) {
    if (!existsSync(fichier)) continue;
    const trouve = readFileSync(fichier, "utf8").match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m);
    if (trouve) return { url: trouve[1], source: fichier };
  }
  return { url: "", source: null };
}

const { url, source } = urlDeLaBase();

/* Pas d'URL trouvée : on ne sait pas ce qu'on viserait. On refuse — se tromper
 * dans ce sens ne coûte qu'un message, l'inverse coûte la base. */
if (!url) {
  console.error(
    `\n⛔  ${commande} refusée : aucune DATABASE_URL trouvée.\n` +
      `    Impossible de savoir quelle base serait touchée, donc on ne touche à rien.\n`,
  );
  process.exit(1);
}

const hote = url.replace(/^[^@]*@/, "").split(/[/?]/)[0];
const estLaProd = HOTES_DE_PRODUCTION.some((h) => url.includes(h));

if (!estLaProd) {
  console.log(`✓ ${commande} autorisée — base non-production (${hote}), lue depuis ${source}.`);
  process.exit(0);
}

if (process.env[ECHAPPATOIRE] === "oui") {
  console.warn(
    `\n⚠️  ${commande} exécutée SUR LA PRODUCTION (${hote}).\n` +
      `    ${ECHAPPATOIRE} est positionnée. J'espère que c'est voulu.\n`,
  );
  process.exit(0);
}

console.error(
  `\n⛔  ${commande} REFUSÉE : la base visée est la production.\n\n` +
    `    hôte    ${hote}\n` +
    `    source  ${source}\n\n` +
    `    Cette commande détruit ou écrase des données réelles : commandes,\n` +
    `    factures, catalogue. Il n'existe plus de base de développement depuis\n` +
    `    le 3 septembre 2026 — DATABASE_URL vise directement le restaurant.\n\n` +
    `    Pour déployer une migration en production, la commande est :\n` +
    `        npm run db:deploy\n\n` +
    `    Si vous voulez réellement détruire la base de production :\n` +
    `        ${ECHAPPATOIRE}=oui npm run db:${commande}\n`,
);
process.exit(1);
