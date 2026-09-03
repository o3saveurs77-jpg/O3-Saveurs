/**
 * Retire de la carte le plat fourre-tout « Canette 33 cl » — `npm run db:canette-vieille`.
 *
 * `scripts/eclater-canettes.ts` a éclaté ce plat en sept références nommées,
 * puis l'a **désactivé** plutôt que supprimé, par prudence : « les commandes
 * passées le référencent ». La prudence était mal placée. Une commande fige ses
 * lignes en JSON à l'instant où elle est passée (`Order.lines`, « prix
 * historiques ») ; aucune clé étrangère ne relie une facture à la fiche d'un
 * plat. Supprimer la fiche ne retire donc rien d'une facture, et l'obligation
 * de conservation décennale reste tenue par la commande elle-même.
 *
 * Le prix de cette prudence était visible : `available: false` ne veut pas dire
 * « retiré de la carte », il veut dire « épuisé aujourd'hui ». Le plat
 * s'affichait donc toujours, barré d'une pastille ÉPUISÉ — à côté des sept
 * canettes qui, elles, sont en vente. Le client lisait « Coca, Sprite, Fanta,
 * Ice Tea, Orangina, Tropico » sur une carte qui les propose déjà une par une.
 *
 * Les deux garde-fous, avant toute suppression :
 *
 *  1. le plat doit être **déjà retiré de la vente** — refuser d'effacer une
 *     référence encore commandable, quelle qu'elle soit ;
 *  2. plus rien ne doit y renvoyer — créneau de formule, mouvement de stock,
 *     plat du jour. Une référence restante signifierait que l'éclatement n'est
 *     pas terminé, et la suppression casserait une formule.
 *
 * La fiche complète est imprimée avant d'être effacée : c'est la sauvegarde, et
 * elle suffit à la recréer à l'identique en cas d'erreur.
 *
 * Relançable sans dommage : sans le plat, le script ne fait rien et sort en
 * succès.
 */

import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* variables déjà présentes dans l'environnement */
}

const NOM = "Canette 33 cl";

async function main() {
  const prisma = new PrismaClient();

  const plat = await prisma.dish.findFirst({ where: { name: NOM } });
  if (!plat) {
    console.log(`✓ Aucun plat « ${NOM} » en base — rien à faire.`);
    await prisma.$disconnect();
    return;
  }

  if (plat.available) {
    console.error(`✗ « ${NOM} » est encore en vente (available: true).`);
    console.error(
      "  Le retirer de la vente d'abord — ce script n'efface que ce qui est déjà retiré.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const [choix, mouvements, jours] = await Promise.all([
    prisma.formulaChoice.count({ where: { dishId: plat.id } }),
    prisma.stockMovement.count({ where: { dishId: plat.id } }),
    prisma.dailySpecial.count({ where: { dishId: plat.id } }),
  ]);

  if (choix > 0 || mouvements > 0 || jours > 0) {
    console.error(`✗ « ${NOM} » est encore référencé :`);
    console.error(
      `  ${choix} créneau(x) de formule, ${mouvements} mouvement(s) de stock, ${jours} plat(s) du jour.`,
    );
    console.error("  Rejouer `npm run db:canettes` avant de supprimer.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("Fiche supprimée, copie de sauvegarde :");
  console.log(JSON.stringify(plat, null, 2));

  await prisma.dish.delete({ where: { id: plat.id } });
  console.log(`\n✓ « ${NOM} » (${plat.id}) retiré de la carte.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("✗ Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
