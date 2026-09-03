/**
 * Ajoute le Couscous Végétarien et la Pastilla — `npm run db:nouveaux-plats`.
 *
 * Deux plats que la maison cuisine déjà et que la carte ne portait pas. Ils
 * arrivent par leurs photos, livrées le 31 août 2026 : un couscous sans viande,
 * alors que les trois couscous en ligne en contiennent tous, et une pastilla,
 * dont la garniture se choisit — fruits de mer ou poulet, c'est ce qu'annonce
 * la photo fournie.
 *
 * Prix arrêtés avec la cliente : 9,90 € le couscous, deux euros sous le
 * Couscous Poulet ; 9,00 € la pastilla.
 *
 * **Allergènes.** `lib/allergenes.ts` ne sert qu'une fois, au premier versement
 * — la base fait foi ensuite. Un plat créé après ce versement resterait donc
 * sans allergènes déclarés, c'est-à-dire muet là où le règlement INCO
 * 1169/2011 attend une information. Ils sont posés ici, à la création :
 *
 *  · couscous — gluten (semoule de blé) et céleri (bouillon), comme le
 *    Couscous Poulet dont il partage la recette moins la viande ;
 *  · pastilla — gluten et lait (la feuille de brick et son beurre), œufs et
 *    fruits à coque (les amandes), plus crustacés et mollusques, que la
 *    garniture aux fruits de mer apporte. La liste couvre les deux garnitures :
 *    un client allergique ne doit pas avoir à deviner laquelle il commande.
 *
 * ⚠️ Comme tout le reste de cette table, ces listes sont à confronter aux
 * recettes réelles et aux fiches fournisseurs avant d'être tenues pour vraies.
 *
 * Ce que le script ne touche pas : un plat déjà créé garde sa photo, sa
 * disponibilité, son rang et ses allergènes — la cuisine a pu les corriger
 * depuis l'administration, et c'est elle qui a raison. Relançable sans dommage.
 *
 * Ni l'un ni l'autre n'entre dans une formule : les créneaux se remplissent au
 * seed, par famille. La pastilla a néanmoins son supplément déclaré dans
 * `FORMULA_SUPPLEMENTS`, faute de quoi un seed rejoué la ferait entrer à zéro
 * euro dans la formule Midi — vendue à perte.
 *
 * À faire ensuite : `npm run db:photos-cellar`.
 */

import { PrismaClient } from "@prisma/client";
import { items } from "../lib/menu";
import type { Allergen } from "../lib/types";

const prisma = new PrismaClient();

/** Identifiant → allergènes déclarés à la création. */
const ALLERGENES: Record<string, Allergen[]> = {
  "couscous-vegetarien": ["gluten", "celeri"],
  pastilla: ["gluten", "oeufs", "lait", "fruits_a_coque", "crustaces", "mollusques"],
};

async function main() {
  console.log("— Nouveaux plats —\n");

  const dernier = await prisma.dish.aggregate({ _max: { position: true } });
  let position = (dernier._max.position ?? 0) + 1;

  for (const id of Object.keys(ALLERGENES)) {
    const d = items.find((i) => i.id === id);
    if (!d) throw new Error(`« ${id} » a disparu de lib/menu.ts`);

    const commun = {
      cat: d.cat,
      name: d.name,
      desc: d.desc,
      priceCents: Math.round((d.price ?? 0) * 100),
      tags: JSON.stringify(d.tags),
      options: JSON.stringify(d.options),
      vatRateBp: d.vatRateBp ?? 1000,
    };

    const dejaLa = await prisma.dish.findUnique({ where: { id }, select: { id: true } });

    await prisma.dish.upsert({
      where: { id },
      create: {
        id,
        ...commun,
        badge: d.badge,
        photo: d.photo,
        allergens: JSON.stringify(ALLERGENES[id]),
        available: true,
        position: position++,
      },
      update: commun,
    });

    console.log(
      dejaLa
        ? `= ${d.name.padEnd(22)} déjà en base, libellés et prix rafraîchis`
        : `🍽️  ${d.name.padEnd(22)} ${((d.price ?? 0)).toFixed(2)} € · ${ALLERGENES[id].length} allergène(s)`,
    );
  }

  console.log(
    "\n✅ Terminé.\n" +
      "   · `npm run db:photos-cellar` pour verser les photos sur Cellar ;\n" +
      "   · écran Plats — vérifier les allergènes contre les recettes réelles.",
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
