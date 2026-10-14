/* Accès à la base d'intégration, jetable et locale.
 *
 * Tout le reste de la suite double Prisma en mémoire, et c'est le bon choix :
 * `.env` pointe la base de production du restaurant, où un test qui écrit
 * créerait de vraies commandes et consommerait de vrais numéros de facture.
 *
 * Mais un double en mémoire ne sait pas imiter PostgreSQL là où ça compte :
 * une contrainte d'unicité qui tranche entre deux écritures simultanées, une
 * transaction qui s'annule, un verrou de ligne. Ces tests-là ont donc besoin
 * d'une vraie base — et d'une base qu'on peut casser.
 *
 * Le conteneur se monte ainsi :
 *
 *   docker run -d --name o3-test-db -e POSTGRES_PASSWORD=jetable \
 *     -e POSTGRES_USER=o3 -e POSTGRES_DB=o3test -p 55432:5432 postgres:16-alpine
 *   for d in prisma/migrations/*&#47;; do
 *     docker exec -i o3-test-db psql -U o3 -d o3test -v ON_ERROR_STOP=1 -q < "$d/migration.sql"
 *   done
 *
 * Sans conteneur, ces tests se **sautent** au lieu d'échouer : la suite doit
 * rester verte sur un poste qui n'a pas Docker, sans quoi personne ne la
 * lancera plus.
 */

import { PrismaClient } from "@prisma/client";

/* L'URL est écrite ici, en clair, et c'est voulu : ce sont les identifiants
 * d'un conteneur jetable, sur la machine qui lance les tests. Les lire depuis
 * l'environnement ferait courir le risque que `.env` l'emporte — c'est
 * exactement ce qui est arrivé en essayant de viser le conteneur avec la CLI
 * Prisma, qui a continué de parler à la production malgré la variable. */
export const URL_JETABLE = "postgresql://o3:jetable@localhost:55432/o3test";

let client: PrismaClient | null = null;

/** Client Prisma visant le conteneur, et lui seul. */
export function baseJetable(): PrismaClient {
  client ??= new PrismaClient({ datasourceUrl: URL_JETABLE });
  return client;
}

/** `true` si le conteneur répond. Sert à sauter proprement, pas à échouer. */
export async function baseDisponible(): Promise<boolean> {
  try {
    await baseJetable().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function fermer(): Promise<void> {
  if (client) await client.$disconnect();
  client = null;
}

/** Table rase entre deux tests : l'ordre suit les clés étrangères. */
export async function vider(): Promise<void> {
  const db = baseJetable();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "StockMovement", "Order", "FormulaChoice", "FormulaSlot", "Formula",
      "Dish", "Category", "Counter", "NewsletterSubscriber", "EmailLog"
    RESTART IDENTITY CASCADE
  `);
}
