/**
 * Donne sa photo à chaque canette — `npm run db:photos-canettes`.
 *
 * L'éclatement des canettes (`scripts/eclater-canettes.ts`) a créé sept
 * références sans visuel : six marques et l'eau. Sur la carte, une famille
 * entière s'affichait donc en pastilles grises, juste après des plats
 * photographiés — et le créneau boisson des formules ne montrait rien à
 * choisir. La cliente a depuis fourni six visuels, un par marque.
 *
 * Pourquoi un script plutôt qu'un seed : la base de production ne se met pas à
 * jour depuis `lib/menu.ts`, et `eclater-canettes.ts` ne pose volontairement la
 * photo qu'à la création, pour ne pas effacer celle que la cuisine aurait
 * téléversée entre-temps. Il faut donc un passage dédié, qui n'écrit que là où
 * il n'y a rien.
 *
 * Ce qu'il fait, référence par référence :
 *
 *  · aucune photo → il pose le chemin livré ;
 *  · photo déjà servie depuis ce même fichier → il ne touche à rien ;
 *  · ancienne vignette Coca (`coca-cola-….webp`, 600 px sur fond blanc, sans
 *    rapport avec la série livrée) → il la remplace ;
 *  · toute autre photo → c'est un choix de la cuisine, il la laisse et le dit.
 *
 * L'eau n'a pas de visuel dans la livraison : elle reste sans photo.
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

/** Identifiant de la référence → fichier livré dans `public/photos/`. */
const PHOTOS: Record<string, string> = {
  "can-coca": "coca-cola.jpg",
  "can-sprite": "sprite.jpg",
  "can-fanta": "fanta.jpg",
  "can-ice-tea": "ice-tea.jpg",
  "can-orangina": "orangina.jpg",
  "can-tropico": "tropico.jpg",
};

/**
 * La photo actuelle sort-elle déjà du fichier livré ?
 *
 * Le chemin change de forme une fois versé sur Cellar — `/photos/sprite.jpg`
 * devient `https://…/plats/sprite-a1b2c3d4.jpg` — mais le nom de base reste. On
 * le reconnaît donc par son radical, sans quoi une relance après
 * `db:photos-cellar` ramènerait la base au chemin local.
 */
function dejaServie(photo: string, fichier: string): boolean {
  const radical = fichier.replace(/\.jpg$/, "");
  const nom = photo.split("/").pop() ?? "";
  return nom === fichier || new RegExp(`^${radical}-[0-9a-f]{8}\.jpg$`).test(nom);
}

/** L'ancienne vignette Coca, seule photo que ce script a le droit d'écraser. */
function ancienneVignetteCoca(id: string, photo: string): boolean {
  return id === "can-coca" && /coca-cola(-[0-9a-f]+)?\.webp$/.test(photo);
}

async function main() {
  console.log("— Photos des canettes —\n");

  const manquants = Object.values(PHOTOS).filter(
    (f) => !existsSync(join(process.cwd(), "public", "photos", f)),
  );
  if (manquants.length) {
    throw new Error(`Fichier(s) absent(s) de public/photos : ${manquants.join(", ")}`);
  }

  let poses = 0;
  let dejaLa = 0;
  const gardees: string[] = [];
  const absents: string[] = [];

  for (const [id, fichier] of Object.entries(PHOTOS)) {
    const plat = await prisma.dish.findUnique({ where: { id }, select: { name: true, photo: true } });
    if (!plat) {
      absents.push(id);
      continue;
    }

    if (plat.photo && dejaServie(plat.photo, fichier)) {
      dejaLa++;
      continue;
    }

    if (plat.photo && !ancienneVignetteCoca(id, plat.photo)) {
      gardees.push(`${plat.name} → ${plat.photo}`);
      continue;
    }

    const chemin = `/photos/${fichier}`;
    await prisma.dish.update({ where: { id }, data: { photo: chemin } });
    console.log(`📷 ${plat.name.padEnd(20)} ${plat.photo ? "remplacée par" : "→"} ${chemin}`);
    poses++;
  }

  console.log(`\n${poses} photo(s) posée(s), ${dejaLa} déjà à jour.`);

  if (gardees.length) {
    console.log(
      `\n⚠️  ${gardees.length} référence(s) ont déjà une autre photo — laissées en l'état :\n   ` +
        gardees.join("\n   "),
    );
  }
  if (absents.length) {
    console.log(
      `\n⚠️  ${absents.length} référence(s) absente(s) de la base : ${absents.join(", ")}\n` +
        "   Lancer d'abord `npm run db:canettes`.",
    );
  }

  console.log(
    "\nEnsuite : `npm run db:photos-cellar` pour verser les fichiers sur Cellar\n" +
      "et repointer la base dessus. L'eau minérale reste sans visuel.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
