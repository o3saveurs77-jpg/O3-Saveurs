/**
 * Donne sa photo aux six derniers plats qui n'en avaient pas —
 * `npm run db:photos-nouvelles`.
 *
 * Six fiches s'affichaient encore en pastille grise : les quatre nouveautés
 * d'août (`scripts/nouveaux-plats.ts` les a créées sans visuel, faute de photo
 * à l'époque), l'agneau entier de la section « sur commande », seule pièce à
 * réserver que `db:grands-formats` n'avait pas pu illustrer, et la Panna Cotta,
 * dessert de l'ancienne carte qui ne figure pas dans `lib/menu.ts` et n'est
 * donc jamais passé par un seed. La maison a livré les six visuels le
 * 3 septembre 2026.
 *
 * Une pastille grise coûte plus qu'un défaut d'esthétique : sur la carte ces
 * fiches voisinent des plats photographiés, et le Couscous Royal à 13,90 € —
 * le plus cher de sa famille — se choisissait à l'aveugle contre un Couscous
 * Poulet lui aussi muet. Dans les formules, le créneau ne montrait rien à
 * choisir, la panne déjà décrite pour les canettes.
 *
 * Pourquoi un script plutôt qu'un seed : la base de production ne se met pas à
 * jour depuis `lib/menu.ts`, et la Panna Cotta n'y a même pas de ligne. Il faut
 * donc un passage dédié, qui n'écrit que là où il n'y a rien.
 *
 * Ce qu'il fait, fiche par fiche :
 *
 *  · aucune photo → il pose le chemin livré ;
 *  · photo déjà servie depuis ce même fichier → il ne touche à rien ;
 *  · toute autre photo → c'est un choix de la cuisine, il la laisse et le dit.
 *
 * Les fichiers sont convertis depuis les originaux par
 * `scraps/convertir-nouvelles.mjs`, et leur cadrage vérifié aux trois formats
 * réels du site par `scraps/verif-cadrage-nouvelles.mjs`. Aucun ne porte de
 * titre incrusté : rien à recadrer, contrairement aux visuels du dépliant.
 *
 * Rien n'est écrit dans `lib/menu.ts` : le champ `photo` du seed n'est lu qu'à
 * la création, et ces six fiches existent dans toutes les bases. C'est le
 * précédent des pièces à réserver, dont les visuels ont été posés de la même
 * façon sans toucher au seed — la base fait foi.
 *
 * ⚠️ L'agneau entier était le manque nommé par le lot des pièces à réserver
 * (« seul des six sans photo ») : la maison répond donc à une demande précise.
 * Le visuel livré montre cependant **une pièce rôtie sur un plat**, très proche
 * de celui du gigot à 85 € et visiblement moins abondant que le demi-agneau à
 * 240 €. Sur une pièce à 450 € annoncée « rôtie à la braise, pour vos fêtes »,
 * la photo dessert le prix, et la section aligne trois plats de viande qui se
 * ressemblent. Elle est posée telle quelle — c'est le choix de la maison pour
 * cette fiche — mais un méchoui entier reste à demander.
 *
 * À faire ensuite : `npm run db:photos-cellar`, qui verse les fichiers sur
 * Cellar et repointe la base dessus. Sans ce second passage, les photos sont
 * servies depuis `public/photos/` — ce qui fonctionne, mais hors CDN et sans
 * l'empreinte de contenu qui rend le cache d'un an honnête.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Identifiant de la fiche → fichier livré dans `public/photos/`. */
const PHOTOS: Record<string, string> = {
  "mafe-poulet": "mafe-poulet.jpg",
  "couscous-poulet": "couscous-poulet.jpg",
  "couscous-royal": "couscous-royal.jpg",
  "agneau-braise": "agneau-braise.jpg",
  "sc-agneau-entier": "agneau-entier.jpg",
  d54: "panna-cotta.jpg",
};

/**
 * La photo actuelle sort-elle déjà du fichier livré ?
 *
 * Le chemin change de forme une fois versé sur Cellar — `/photos/mafe-poulet.jpg`
 * devient `https://…/plats/mafe-poulet-a1b2c3d4.jpg` — mais le nom de base
 * reste. On le reconnaît donc par son radical, sans quoi une relance après
 * `db:photos-cellar` ramènerait la base au chemin local.
 */
function dejaServie(photo: string, fichier: string): boolean {
  const radical = fichier.replace(/\.jpg$/, "");
  const nom = photo.split("/").pop() ?? "";
  return nom === fichier || new RegExp(`^${radical}-[0-9a-f]{8}\\.jpg$`).test(nom);
}

async function main() {
  console.log("— Photos des six fiches sans visuel —\n");

  const manquants = Object.values(PHOTOS).filter(
    (f) => !existsSync(join(process.cwd(), "public", "photos", f)),
  );
  if (manquants.length) {
    throw new Error(
      `Fichier(s) absent(s) de public/photos : ${manquants.join(", ")}\n` +
        "Lancer d'abord `node scraps/convertir-nouvelles.mjs`.",
    );
  }

  let poses = 0;
  let dejaLa = 0;
  const gardees: string[] = [];
  const absents: string[] = [];

  for (const [id, fichier] of Object.entries(PHOTOS)) {
    const plat = await prisma.dish.findUnique({
      where: { id },
      select: { name: true, photo: true },
    });
    if (!plat) {
      absents.push(id);
      continue;
    }

    if (plat.photo && dejaServie(plat.photo, fichier)) {
      dejaLa++;
      continue;
    }

    if (plat.photo) {
      gardees.push(`${plat.name} → ${plat.photo}`);
      continue;
    }

    const chemin = `/photos/${fichier}`;
    await prisma.dish.update({ where: { id }, data: { photo: chemin } });
    console.log(`📷 ${plat.name.padEnd(26)} → ${chemin}`);
    poses++;
  }

  console.log(`\n${poses} photo(s) posée(s), ${dejaLa} déjà à jour.`);

  if (gardees.length) {
    console.log(
      `\n⚠️  ${gardees.length} fiche(s) ont déjà une autre photo — laissées en l'état :\n   ` +
        gardees.join("\n   "),
    );
  }
  if (absents.length) {
    console.log(
      `\n⚠️  ${absents.length} fiche(s) absente(s) de la base : ${absents.join(", ")}\n` +
        "   Les quatre nouveautés d'août viennent de `npm run db:nouveaux-plats`,\n" +
        "   l'agneau entier du seed ; `d54` (Panna Cotta) n'appartient qu'à la base\n" +
        "   d'origine et ne se recrée par aucun script — voir RECONCILIATION-CARTE.md.",
    );
  }

  const restants = await prisma.dish.count({ where: { photo: null } });
  console.log(
    restants
      ? `\n${restants} plat(s) restent sans photo.`
      : "\n✅ Plus aucun plat sans photo.",
  );
  console.log(
    "\nEnsuite : `npm run db:photos-cellar` pour verser les fichiers sur Cellar\n" +
      "et repointer la base dessus.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
