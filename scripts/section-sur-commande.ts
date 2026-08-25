/**
 * Ajoute le bloc « Plats sur commande » à l'accueil déjà en base —
 * `npm run db:sur-commande`.
 *
 * `DEFAULT_SECTIONS` ne sert qu'aux pages **vides** : une fois le back-office
 * ouvert, l'accueil vit en base et n'y revient jamais. Ajouter un bloc au
 * catalogue ne le fait donc pas apparaître sur un site en service — il faut
 * l'y poser une fois, et c'est tout l'objet de ce script.
 *
 * Il se relance sans dommage : si un bloc « sur commande » existe déjà sur
 * l'accueil, il n'y touche pas. Une fois posé, le bloc appartient à la
 * cliente — titres, textes et habillage se modifient depuis
 * *Back-office › Contenu du site*, et une relance ne les écraserait pas.
 *
 * Le bloc se glisse juste après les formules : l'offre du quotidien, puis
 * celle des grandes occasions, avant les informations pratiques.
 *
 * Usage :
 *   npm run db:sur-commande                                 # base de `.env`
 *   npm run db:sur-commande -- --env=.env.production.local  # base de l'hébergeur
 */

import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { starterContent } from "../lib/pageSections";

/**
 * Choix explicite de la base — `--env=.env.production.local`.
 *
 * Le projet en tient deux : celle de `.env` (Neon, développement) et celle de
 * l'hébergeur. Sans cette option, Prisma prend la première et ce script écrit
 * donc en développement — ce qui donne exactement la panne qu'il est censé
 * réparer : le bloc apparaît sur le poste, jamais sur le site. Nommer le
 * fichier cible évite d'avoir à deviner, et l'hôte est affiché avant écriture.
 */
function urlDepuis(fichier: string): string {
  const m = readFileSync(fichier, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error(`DATABASE_URL absente de ${fichier}`);
  return m[1];
}

const fichierEnv = process.argv.slice(2).find((a) => a.startsWith("--env="))?.slice("--env=".length);
const url = fichierEnv ? urlDepuis(fichierEnv) : undefined;

/* Deux appels distincts plutôt qu'un objet d'options construit à la volée :
 * `PrismaClient` est générique sur ses options, et une union `{datasourceUrl} | {}`
 * ne satisfait pas sa contrainte. */
const prisma = url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();

const PAGE = "accueil";
const KIND = "sur_commande";
const LABEL = "Plats sur commande";
/** Bloc après lequel se ranger ; à défaut, le nouveau bloc part en fin de page. */
const APRES = "formules";

async function main() {
  console.log("— Bloc « Plats sur commande » sur l'accueil —");
  /* L'hôte, jamais les identifiants : de quoi vérifier d'un coup d'œil qu'on
   * n'écrit pas dans la mauvaise base, sans étaler un mot de passe dans un
   * journal de terminal. */
  const hote = url ? new URL(url).host : "base par défaut (.env)";
  console.log(`  base : ${hote}\n`);

  const sections = await prisma.pageSection.findMany({
    where: { page: PAGE },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, label: true, position: true },
  });

  if (!sections.length) {
    console.log(
      "ℹ️  L'accueil n'a aucune section en base : il affiche encore le contenu par défaut,\n" +
        "   qui contient déjà ce bloc. Rien à faire — ouvrez Back-office › Contenu du site\n" +
        "   pour le semer avec le reste de la page.",
    );
    return;
  }

  const deja = sections.find((s) => s.kind === KIND);
  if (deja) {
    console.log(
      `ℹ️  Déjà présent en position ${deja.position} (« ${deja.label} ») — rien n'est modifié.\n` +
        "   Ses textes se règlent depuis Back-office › Contenu du site.",
    );
    return;
  }

  /* Position visée : juste après les formules. Les blocs suivants descendent
   * d'un cran, du dernier vers le premier — deux lignes ne peuvent ainsi
   * jamais se retrouver sur la même position en cours de route. */
  const ancre = sections.find((s) => s.kind === APRES);
  const cible = ancre ? ancre.position + 1 : sections.length;

  const aDecaler = sections.filter((s) => s.position >= cible).reverse();
  for (const s of aDecaler) {
    await prisma.pageSection.update({
      where: { id: s.id },
      data: { position: s.position + 1 },
    });
  }

  await prisma.pageSection.create({
    data: {
      page: PAGE,
      kind: KIND,
      label: LABEL,
      position: cible,
      visible: true,
      contentJson: JSON.stringify(starterContent(KIND)),
    },
  });

  console.log(
    `✅ Bloc ajouté en position ${cible}` +
      (ancre ? `, juste après « ${ancre.label} »` : ", en fin de page") +
      (aDecaler.length ? ` — ${aDecaler.length} bloc(s) décalé(s)` : "") +
      ".",
  );
  console.log(
    "\nℹ️  L'accueil est mis en cache 5 minutes : le bloc s'affiche d'ici là, ou\n" +
      "   immédiatement après un enregistrement dans Back-office › Contenu du site.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
