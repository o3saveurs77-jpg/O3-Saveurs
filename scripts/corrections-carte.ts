/**
 * Trois corrections relevées par la cliente sur la carte en ligne —
 * `npm run db:corrections-carte`.
 *
 *  1. **L'agneau braisé n'est pas une épaule mais une brochette.** La fiche
 *     annonçait « Agneau Braisé · Épaule d'agneau braisée au feu de bois » ; le
 *     plat servi est une brochette. Le titre et la description suivent.
 *
 *  2. **Le thiéboudiène blanc prend la photo livrée.** Elle porte son titre
 *     incrusté, comme les visuels du dépliant, et c'est le parti pris retenu par
 *     la maison : la photo est posée telle quelle, sans recadrage. Vérifié dans
 *     le cadrage 4:3 des cartes — le titre y tient entier.
 *
 *  3. **La pastilla se vend à deux prix.** 8,90 € au poulet, 10,90 € aux fruits
 *     de mer. Une seule fiche, le second prix porté par l'option de garniture :
 *     `unitPriceOf` et `priceFormula` ajoutent tous deux le supplément d'option
 *     au montant facturé, à la carte comme à l'intérieur d'une formule. Sa photo
 *     est reposée telle que livrée, titre compris — elle avait été recadrée pour
 *     retirer ce titre, ce que la cliente a fait remonter.
 *
 * Les allergènes de la pastilla gagnent « poissons » : la garniture marine était
 * déclarée aux crustacés et aux mollusques, mais la maison la nomme « poisson ».
 * Déclarer les trois ne coûte rien et ne laisse pas un client allergique deviner.
 *
 * ## Ce que le script refuse de faire
 *
 * Chaque écriture est conditionnée à la valeur d'avant : un plat que la cuisine
 * aurait renommé, rephotographié ou reprisé depuis l'administration est laissé
 * en l'état et signalé. Relançable sans dommage.
 *
 * À faire ensuite : `npm run db:photos-cellar`, qui verse les deux photos sur
 * Cellar et repointe la base dessus.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Ce qu'on s'autorise à remplacer, et par quoi. */
const AGNEAU = {
  id: "agneau-braise",
  avantNom: "Agneau Braisé",
  nom: "Brochette d'agneau braisé",
  desc: "Brochettes d'agneau braisé au feu de bois, fondantes et épicées — 1 accompagnement au choix.",
};

const THIEB = {
  id: "d36",
  nom: "Thiéboudiène blanc",
  photo: "/photos/thieboudiene-blanc.jpg",
};

const PASTILLA = {
  id: "pastilla",
  avantPrix: 900,
  prix: 890,
  photo: "/photos/pastilla.jpg",
  options: [
    {
      name: "Garniture",
      required: true,
      choices: [{ l: "Poulet" }, { l: "Fruits de mer", priceCents: 200 }],
    },
  ],
  allergens: ["gluten", "oeufs", "lait", "fruits_a_coque", "poissons", "crustaces", "mollusques"],
};

const laisses: string[] = [];

async function renommerLAgneau(): Promise<void> {
  const plat = await prisma.dish.findUnique({ where: { id: AGNEAU.id } });
  if (!plat) {
    laisses.push(`${AGNEAU.id} absent de la base`);
    return;
  }
  if (plat.name === AGNEAU.nom) {
    console.log(`= ${AGNEAU.nom} — déjà renommé`);
    return;
  }
  if (plat.name !== AGNEAU.avantNom) {
    laisses.push(`« ${plat.name} » ne porte plus le nom d'origine — renommage sauté`);
    return;
  }
  await prisma.dish.update({ where: { id: AGNEAU.id }, data: { name: AGNEAU.nom, desc: AGNEAU.desc } });
  console.log(`🍢 « ${AGNEAU.avantNom} » → « ${AGNEAU.nom} »`);
}

async function rephotographierLeThieb(): Promise<void> {
  const plat = await prisma.dish.findUnique({ where: { id: THIEB.id } });
  if (!plat || plat.name !== THIEB.nom) {
    laisses.push(`${THIEB.id} n'est pas « ${THIEB.nom} » — photo sautée`);
    return;
  }
  /* La photo actuelle vient du dépliant (`pNN`) ; celle qu'on pose est la
   * livraison du 31 août. Reconnue par son radical, elle survit au passage sur
   * Cellar, où le nom prend une empreinte. */
  const nom = (plat.photo ?? "").split("/").pop() ?? "";
  if (/^thieboudiene-blanc(-[0-9a-f]{8})?\.jpg$/.test(nom)) {
    console.log(`= ${THIEB.nom} — photo déjà à jour`);
    return;
  }
  await prisma.dish.update({ where: { id: THIEB.id }, data: { photo: THIEB.photo } });
  console.log(`📷 ${THIEB.nom.padEnd(22)} ${nom || "aucune"} → ${THIEB.photo}`);
}

async function reprixerLaPastilla(): Promise<void> {
  const plat = await prisma.dish.findUnique({ where: { id: PASTILLA.id } });
  if (!plat) {
    laisses.push("la pastilla est absente de la base — lancer `npm run db:nouveaux-plats`");
    return;
  }
  if (plat.priceCents !== PASTILLA.avantPrix && plat.priceCents !== PASTILLA.prix) {
    laisses.push(`la pastilla est à ${(plat.priceCents ?? 0) / 100} € — prix laissé en l'état`);
    return;
  }

  await prisma.dish.update({
    where: { id: PASTILLA.id },
    data: {
      priceCents: PASTILLA.prix,
      options: JSON.stringify(PASTILLA.options),
      allergens: JSON.stringify(PASTILLA.allergens),
      photo: PASTILLA.photo,
    },
  });
  console.log(
    `🥮 Pastilla ${(PASTILLA.prix / 100).toFixed(2)} € au poulet, ` +
      `${((PASTILLA.prix + 200) / 100).toFixed(2)} € aux fruits de mer`,
  );
}

async function main() {
  console.log("— Corrections de la carte —\n");
  await renommerLAgneau();
  await rephotographierLeThieb();
  await reprixerLaPastilla();

  if (laisses.length) {
    console.log(`\n⚠️  laissé(s) en l'état :\n   ` + laisses.join("\n   "));
  }
  console.log("\n✅ Terminé. Ensuite : `npm run db:photos-cellar`.");
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
