/**
 * Ajoute les bouteilles de 1,5 L à la carte — `npm run db:grands-formats`.
 *
 * La grille boissons d'août 2026 remise par la cliente ouvre un format que le
 * catalogue ne connaissait pas. La raison est dans le panier : une commande de
 * couscous pour six repartait avec six canettes à 2 € — plus cher pour le
 * client, moins rentable pour la maison qu'une bouteille à 4 €. Le format
 * manquait, il ne se vendait donc pas.
 *
 * Sept références : les six sodas des canettes, et l'eau. Ce sont les marques
 * des photos fournies par la maison, pas la liste indicative du document, qui
 * citait Oasis et Evian — on ne met pas en vente une référence dont personne
 * n'a confirmé qu'elle est au frigo.
 *
 * L'eau de 50 cl prend au passage sa marque, comme la grille le demande
 * (« afficher la marque dans le libellé ») : « Eau minérale 50 cl » devient
 * « Volvic 50 cl », et reçoit la photo livrée. Une eau nommée justifie son prix
 * face aux premiers prix des concurrents ; une eau anonyme, non.
 *
 * Ce script n'écrit **que** ce qui n'a pas déjà été touché depuis
 * l'administration : une référence existante garde sa photo, sa disponibilité
 * et son rang ; l'eau n'est renommée que si elle porte encore son nom d'usine.
 * Relançable sans dommage.
 *
 * Ce qu'il ne fait pas : ni stock, ni upsell. La cuisine saisit ce qu'elle a au
 * frigo depuis l'écran Stocks, et la règle 1 de la grille — proposer la
 * bouteille sur les commandes familiales — demande une décision sur les
 * formules, pas une ligne de script.
 *
 * À faire ensuite : `npm run db:photos-cellar`, qui verse les photos sur Cellar
 * et repointe la base dessus.
 */

import { PrismaClient } from "@prisma/client";
import { cats, items } from "../lib/menu";

const prisma = new PrismaClient();

const FAMILLE = "canettes";
/** Identifiants des références de 1,5 L, dans l'ordre de la carte. */
const GRANDS = ["btl-coca", "btl-sprite", "btl-fanta", "btl-ice-tea", "btl-orangina", "btl-tropico", "btl-volvic"];
/** Nom d'origine de l'eau, celui qu'on a le droit de remplacer. */
const EAU_ANONYME = "Eau minérale 50 cl";

/** La famille ne contient plus seulement des canettes et de l'eau. */
async function renommerLaFamille(): Promise<void> {
  const cat = cats.find((c) => c.id === FAMILLE);
  if (!cat) throw new Error(`La famille « ${FAMILLE} » a disparu de lib/menu.ts`);

  const enBase = await prisma.category.findUnique({ where: { slug: FAMILLE } });
  if (!enBase) throw new Error("La famille des canettes est absente — lancer `npm run db:canettes` d'abord.");

  if (enBase.label === cat.label) {
    console.log(`📂 famille déjà nommée « ${cat.label} »`);
    return;
  }

  await prisma.category.update({
    where: { slug: FAMILLE },
    data: { label: cat.label, script: cat.script },
  });
  console.log(`📂 « ${enBase.label} » → « ${cat.label} »`);
}

async function creerLesBouteilles(): Promise<void> {
  const refs = items.filter((d) => GRANDS.includes(d.id));
  if (refs.length !== GRANDS.length) {
    throw new Error(`lib/menu.ts ne décrit que ${refs.length} bouteille(s) sur ${GRANDS.length}`);
  }

  const dernier = await prisma.dish.aggregate({ _max: { position: true } });
  let position = (dernier._max.position ?? 0) + 1;

  let crees = 0;
  let majs = 0;

  for (const d of refs) {
    const commun = {
      cat: d.cat,
      name: d.name,
      desc: d.desc,
      priceCents: Math.round((d.price ?? 0) * 100),
      tags: JSON.stringify(d.tags),
      vatRateBp: d.vatRateBp ?? 550,
    };

    const dejaLa = await prisma.dish.findUnique({ where: { id: d.id }, select: { id: true } });

    /* `available`, `photo` et `position` ne sont posés qu'à la création : une
     * relance ne doit pas remettre en vente une bouteille que la cuisine a
     * retirée, ni effacer la photo qu'elle aurait changée depuis. */
    await prisma.dish.upsert({
      where: { id: d.id },
      create: { id: d.id, ...commun, photo: d.photo, available: true, position: position++ },
      update: commun,
    });

    if (dejaLa) majs++;
    else crees++;
  }

  console.log(`🍾 ${crees} bouteille(s) créée(s), ${majs} mise(s) à jour`);
}

/**
 * L'eau de 50 cl prend sa marque et sa photo.
 *
 * Renommer un plat que la cliente aurait elle-même rebaptisé serait lui passer
 * dessus : on ne touche qu'au libellé d'usine.
 */
async function nommerLEau(): Promise<void> {
  const eau = items.find((d) => d.id === "can-eau");
  if (!eau) throw new Error("La référence « can-eau » a disparu de lib/menu.ts");

  const enBase = await prisma.dish.findUnique({ where: { id: "can-eau" } });
  if (!enBase) {
    console.log("💧 pas d'eau 50 cl en base — rien à renommer");
    return;
  }

  const data: { name?: string; desc?: string; photo?: string } = {};
  if (enBase.name === EAU_ANONYME) {
    data.name = eau.name;
    data.desc = eau.desc;
  }
  if (!enBase.photo && eau.photo) data.photo = eau.photo;

  if (!Object.keys(data).length) {
    console.log(`💧 « ${enBase.name} » déjà à jour`);
    return;
  }

  await prisma.dish.update({ where: { id: "can-eau" }, data });
  console.log(
    `💧 « ${enBase.name} »${data.name ? ` → « ${data.name} »` : ""}${data.photo ? " + photo" : ""}`,
  );
}

async function main() {
  console.log("— Grands formats —\n");
  await renommerLaFamille();
  await creerLesBouteilles();
  await nommerLEau();
  console.log(
    "\n✅ Terminé.\n" +
      "   · `npm run db:photos-cellar` pour verser les photos sur Cellar ;\n" +
      "   · écran Stocks — saisir ce qui est réellement au frigo, bouteille par bouteille.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
