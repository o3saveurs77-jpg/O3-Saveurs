/**
 * Éclate le plat fourre-tout « Canette 33 cl » en une référence par boisson —
 * `npm run db:canettes`.
 *
 * La base de production ne se met pas à jour depuis `lib/menu.ts` : rejouer le
 * seed entier y réécrirait 26 prix que la cliente n'a pas encore validés (voir
 * `RECONCILIATION-CARTE.md`). Ce script ne touche donc qu'aux canettes.
 *
 * Ce qu'il fait, dans cet ordre :
 *
 *  1. crée la famille « Canettes & Eaux » et décale les familles suivantes ;
 *  2. crée les sept références, avec leur prix et leur TVA à 5,5 % ;
 *  3. remplace l'ancienne canette par les sept dans tous les créneaux de
 *     formule où elle figurait, en conservant le supplément saisi ;
 *  4. désactive l'ancien plat — sans le supprimer : les commandes passées le
 *     référencent, et une facture doit rester lisible dix ans (code de
 *     commerce). Il disparaît de la carte, il reste dans l'historique.
 *
 * Relançable sans dommage : tout est en `upsert` ou conditionné à l'existant.
 * Aucun stock n'est posé — c'est à la cuisine de saisir ce qu'elle a
 * réellement au frigo, depuis l'écran Stocks.
 */

import { PrismaClient } from "@prisma/client";
import { cats, items } from "../lib/menu";

const prisma = new PrismaClient();

/** Nom du plat fourre-tout à retirer de la carte. */
const ANCIEN = "Canette 33 cl";
const FAMILLE = "canettes";

async function creerFamille(): Promise<void> {
  const cat = cats.find((c) => c.id === FAMILLE);
  if (!cat) throw new Error(`La famille « ${FAMILLE} » a disparu de lib/menu.ts`);

  const position = cats.indexOf(cat);
  const dejaLa = await prisma.category.findUnique({ where: { slug: FAMILLE } });

  /* Les familles rangées après elle glissent d'un cran — mais **à la création
   * seulement** : rejoué, ce décalage repousserait les desserts d'un cran à
   * chaque exécution jusqu'à les envoyer en fin de carte. On ne touche qu'à la
   * position, pas aux libellés, dont plusieurs attendent encore l'accord de la
   * cliente. */
  if (!dejaLa) {
    await prisma.category.updateMany({
      where: { position: { gte: position } },
      data: { position: { increment: 1 } },
    });
  }

  await prisma.category.upsert({
    where: { slug: FAMILLE },
    create: { slug: FAMILLE, label: cat.label, script: cat.script, position },
    update: { label: cat.label, script: cat.script, position },
  });

  console.log(`📂 famille « ${cat.label} » en position ${position}`);
}

async function creerReferences(): Promise<string[]> {
  const refs = items.filter((d) => d.cat === FAMILLE);
  if (!refs.length) throw new Error("Aucune référence de canette dans lib/menu.ts");

  const dernier = await prisma.dish.aggregate({ _max: { position: true } });
  let position = (dernier._max.position ?? 0) + 1;

  for (const d of refs) {
    const commun = {
      cat: d.cat,
      name: d.name,
      desc: d.desc,
      priceCents: Math.round((d.price ?? 0) * 100),
      tags: JSON.stringify(d.tags),
      vatRateBp: d.vatRateBp ?? 550,
    };

    /* `available`, `stock`, `photo` et `position` ne sont posés qu'à la
     * création : une relance ne doit pas remettre en vente une référence que la
     * cuisine a retirée, ni effacer la photo qu'elle a ajoutée depuis. */
    await prisma.dish.upsert({
      where: { id: d.id },
      create: { id: d.id, ...commun, available: true, position: position++ },
      update: commun,
    });
  }

  console.log(`🥤 ${refs.length} références : ${refs.map((d) => d.name).join(", ")}`);
  return refs.map((d) => d.id);
}

/**
 * Reporte l'ancienne canette sur les sept références, partout où elle était
 * proposée.
 *
 * Sans cela, un créneau « votre boisson » dont la canette était le seul choix
 * se retrouverait vide : `isFormulaOrderable` retirerait la formule de la
 * carte, et la cliente chercherait longtemps pourquoi.
 */
async function reporterDansLesFormules(ancienId: string, nouveaux: string[]): Promise<void> {
  const choix = await prisma.formulaChoice.findMany({ where: { dishId: ancienId } });
  if (!choix.length) {
    console.log("🍽️  aucune formule ne proposait l'ancienne canette");
    return;
  }

  for (const c of choix) {
    const derniere = await prisma.formulaChoice.aggregate({
      where: { slotId: c.slotId },
      _max: { position: true },
    });
    let position = (derniere._max.position ?? 0) + 1;

    for (const dishId of nouveaux) {
      // Le supplément suit : s'il fallait payer 1 € pour une canette dans cette
      // formule, il le faut pour chacune des sept.
      await prisma.formulaChoice.upsert({
        where: { slotId_dishId: { slotId: c.slotId, dishId } },
        create: {
          slotId: c.slotId,
          dishId,
          supplementCents: c.supplementCents,
          position: position++,
        },
        // Déjà proposée : la cliente a pu y toucher, on ne réécrit rien.
        update: {},
      });
    }
  }

  await prisma.formulaChoice.deleteMany({ where: { dishId: ancienId } });
  console.log(`🍽️  ${choix.length} créneau(x) de formule mis à jour`);
}

async function retirerAncienPlat(): Promise<void> {
  const ancien = await prisma.dish.findFirst({ where: { name: ANCIEN } });
  if (!ancien) {
    console.log(`ℹ️  pas de plat « ${ANCIEN} » en base — rien à retirer`);
    return;
  }

  await reporterDansLesFormules(ancien.id, items.filter((d) => d.cat === FAMILLE).map((d) => d.id));

  await prisma.dish.update({ where: { id: ancien.id }, data: { available: false } });
  console.log(`🚫 « ${ANCIEN} » désactivé (conservé pour l'historique des commandes)`);
}

async function main() {
  console.log("— Éclatement des canettes —");
  await creerFamille();
  await creerReferences();
  await retirerAncienPlat();
  console.log(
    "\n✅ Terminé. À faire ensuite dans l'administration :\n" +
      "   · Stocks — saisir ce qui est réellement au frigo, référence par référence ;\n" +
      "   · Plats — ajuster les prix (l'eau était vendue au prix d'une canette) et\n" +
      "     ajouter ou retirer les références selon ce que la maison tient.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
