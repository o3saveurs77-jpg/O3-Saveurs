/* Monte, remplit ou supprime la base PostgreSQL jetable des tests d'intégration.
 *
 * Pourquoi un conteneur et pas la base du projet : `.env` pointe la base de
 * production du restaurant. Un test qui écrit y créerait de vraies commandes et
 * consommerait de vrais numéros de facture — et ceux-là ne se reprennent
 * jamais, la série doit rester continue devant un contrôle.
 *
 * Pourquoi `psql` dans le conteneur et pas `prisma migrate deploy` : la CLI
 * Prisma lit `.env.production.local` **en priorité sur la variable
 * d'environnement**. Vérifié : `DATABASE_URL=… npx prisma migrate status`
 * continue de parler à Clever Cloud. Les migrations étant du SQL, on les
 * applique directement — aucune ambiguïté possible sur la cible.
 *
 *   node scripts/base-jetable.mjs monter     # conteneur + les 13 migrations
 *   node scripts/base-jetable.mjs etat
 *   node scripts/base-jetable.mjs supprimer
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const NOM = "o3-test-db";
const PORT = 55432;
const MIGRATIONS = "prisma/migrations";

const action = process.argv[2] ?? "etat";

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", ...options }).trim();
}

function tourne() {
  try {
    return docker(["ps", "--filter", "name=" + NOM, "--format", "{{.Names}}"]) === NOM;
  } catch {
    return false;
  }
}

function attendre() {
  for (let i = 0; i < 40; i++) {
    try {
      docker(["exec", NOM, "pg_isready", "-U", "o3", "-d", "o3test"], { stdio: "pipe" });
      return true;
    } catch {
      execFileSync(process.execPath, ["-e", "setTimeout(()=>{},1500)"]);
    }
  }
  return false;
}

if (action === "supprimer") {
  try {
    docker(["rm", "-f", NOM]);
    console.log("conteneur supprimé — plus rien sur cette machine");
  } catch {
    console.log("aucun conteneur à supprimer");
  }
  process.exit(0);
}

if (action === "etat") {
  if (!tourne()) {
    console.log("conteneur arrêté ou absent. `node scripts/base-jetable.mjs monter` pour le créer.");
    console.log("Les tests d'intégration se sauteront proprement en attendant.");
    process.exit(0);
  }
  const n = docker([
    "exec", NOM, "psql", "-U", "o3", "-d", "o3test", "-t", "-c",
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
  ]);
  console.log("conteneur en service sur le port " + PORT + ", " + n.trim() + " tables");
  process.exit(0);
}

if (action !== "monter") {
  console.error("usage : node scripts/base-jetable.mjs monter|etat|supprimer");
  process.exit(1);
}

if (!tourne()) {
  try {
    docker(["start", NOM], { stdio: "pipe" });
    console.log("conteneur existant redémarré");
  } catch {
    docker([
      "run", "-d", "--name", NOM,
      "-e", "POSTGRES_PASSWORD=jetable",
      "-e", "POSTGRES_USER=o3",
      "-e", "POSTGRES_DB=o3test",
      "-p", PORT + ":5432",
      "postgres:16-alpine",
    ]);
    console.log("conteneur créé");
  }
}

if (!attendre()) {
  console.error("PostgreSQL ne répond pas dans le conteneur");
  process.exit(1);
}

/* Les migrations s'appliquent dans l'ordre de leur nom, qui est horodaté.
 * `ON_ERROR_STOP=1` : on veut savoir laquelle casse, pas finir sur une base à
 * moitié construite qui ferait échouer les tests pour une autre raison. */
const dossiers = readdirSync(MIGRATIONS)
  .filter((d) => existsSync(path.join(MIGRATIONS, d, "migration.sql")))
  .sort();

let posees = 0;
for (const d of dossiers) {
  const sql = readFileSync(path.join(MIGRATIONS, d, "migration.sql"));
  try {
    execFileSync(
      "docker",
      ["exec", "-i", NOM, "psql", "-U", "o3", "-d", "o3test", "-v", "ON_ERROR_STOP=1", "-q"],
      { input: sql, stdio: ["pipe", "pipe", "pipe"] },
    );
    posees++;
  } catch (e) {
    const sortie = String(e.stderr ?? e.message);
    /* Rejouer une migration déjà appliquée est normal au second `monter`. */
    if (/already exists/i.test(sortie)) continue;
    console.error("\nmigration en échec : " + d + "\n" + sortie.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  }
}

console.log(posees + " migration(s) appliquée(s) sur " + dossiers.length);
console.log("base prête : postgresql://o3:jetable@localhost:" + PORT + "/o3test");
console.log("tests      : npx vitest run tests/integration");
