/**
 * Retire le Poulet Rôti des formules — `npm run db:poulet-roti`.
 *
 * Il figurait dans quatre créneaux « votre plat », dont celui du Menu Enfant,
 * et chaque fois **sans supplément**. Un poulet entier à 9,90 € partait donc au
 * prix d'un plat de formule : la maison vendait à perte à chaque commande, et
 * un menu enfant proposait un poulet entier.
 *
 * Le plat lui-même reste à la carte : c'est une vente normale à l'unité, il
 * n'est retiré que du choix des formules.
 *
 * Deux garde-fous avant d'écrire :
 *
 *  1. aucun créneau ne doit se retrouver vide. `isFormulaOrderable` retire de
 *     la carte une formule dont un créneau n'offre plus rien — supprimer le
 *     dernier choix ferait disparaître la formule entière sans prévenir ;
 *  2. ce qui est retiré est imprimé avant de l'être, supplément compris : c'est
 *     la sauvegarde, et elle suffit à remettre les lignes à l'identique.
 *
 * Relançable sans dommage : sans choix à retirer, le script ne fait rien.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLAT = "Poulet Rôti";

async function main() {
  console.log(`— ${PLAT} hors formules —\n`);

  const plat = await prisma.dish.findFirst({ where: { name: PLAT }, select: { id: true, name: true } });
  if (!plat) {
    console.log(`ℹ️  pas de plat « ${PLAT} » en base — rien à faire.`);
    return;
  }

  const choix = await prisma.formulaChoice.findMany({
    where: { dishId: plat.id },
    include: { slot: { include: { formula: true, choices: true } } },
  });

  if (!choix.length) {
    console.log(`✓ « ${PLAT} » ne figure dans aucune formule.`);
    return;
  }

  /* Un créneau qui n'offrirait plus rien retirerait sa formule de la carte. On
   * refuse en bloc plutôt que d'en vider un : mieux vaut ne rien faire et le
   * dire que casser une formule à moitié. */
  const viderait = choix.filter((c) => c.slot.choices.length <= 1);
  if (viderait.length) {
    console.error("✗ Refus : ces créneaux n'ont pas d'autre choix que ce plat —");
    for (const c of viderait) console.error(`   ${c.slot.formula.name} / ${c.slot.label}`);
    console.error("  Leur ajouter un autre plat avant de retirer celui-ci.");
    process.exitCode = 1;
    return;
  }

  console.log("Lignes retirées, copie de sauvegarde :");
  for (const c of choix) {
    console.log(
      `   ${c.slot.formula.name} / ${c.slot.label} · supplément ${(c.supplementCents / 100).toFixed(2)} €` +
        ` · rang ${c.position} · restera ${c.slot.choices.length - 1} choix`,
    );
  }

  await prisma.formulaChoice.deleteMany({ where: { dishId: plat.id } });
  console.log(`\n✓ « ${PLAT} » retiré de ${choix.length} créneau(x). Il reste à la carte, à l'unité.`);
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
