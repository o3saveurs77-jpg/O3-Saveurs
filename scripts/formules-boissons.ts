/**
 * Ouvre les créneaux « boisson » aux canettes et aux grands formats —
 * `npm run db:formules-boissons`.
 *
 * Deux manques, et ils n'étaient pas du même ordre.
 *
 *  · Les bouteilles de 1,5 L, créées le 31 août, ne figuraient dans aucune
 *    formule : la maison venait d'ouvrir le format familial et la seule commande
 *    qui appelle vraiment une grande bouteille — la formule d'une tablée — ne
 *    savait pas le proposer.
 *  · Les canettes n'étaient offertes qu'aux formules Express et Menu Enfant.
 *    Gourmande et Sandwich n'ouvraient que les jus maison, sans que rien ne le
 *    justifie : un client qui veut un Coca avec son sandwich devait commander sa
 *    canette à part, hors formule.
 *
 * ## Le supplément suit la boisson incluse, formule par formule
 *
 * Un supplément unique par boisson aurait été plus simple à écrire et faux à
 * l'affichage. La formule Gourmande à 18,90 € inclut sans supplément un jus à
 * 4,50 € ; y facturer 2,00 € une bouteille à 4,00 € ferait payer plus cher un
 * article moins cher, et le client le verrait.
 *
 * La règle retenue : **supplément = prix à la carte − prix de la boisson
 * incluse**, la boisson incluse étant la moins chère de celles que le créneau
 * offre déjà sans supplément. Arrondi au demi-euro, jamais négatif — une
 * boisson moins chère que l'incluse ne se déduit pas, elle est simplement
 * proposée.
 *
 * Ce qui donne, pour un soda de 1,5 L à 4,00 € : +2,00 € en Express (boisson
 * incluse : une canette à 2,00 €), +0,50 € en Gourmande et en Sandwich (un jus
 * à 3,50 €). Aucune formule ne vend à perte, et aucune ne surfacture.
 *
 * ## Le Menu Enfant reste à l'écart des grands formats
 *
 * Il garde ses canettes et ses jus, mais pas les 1,5 L : une bouteille
 * familiale dans un menu à 8,90 € pour un enfant n'a pas de sens — c'est le
 * même raisonnement que pour le poulet entier qui vient d'en être retiré. Un
 * mot suffit à l'y ajouter si la maison le souhaite.
 *
 * ## Ce que le script ne fait pas
 *
 * Il n'écrit que des lignes absentes. Un choix déjà proposé garde son
 * supplément, quel qu'il soit : la cliente a pu l'ajuster depuis
 * l'administration, et c'est elle qui a raison. Relançable sans dommage.
 *
 * Il ne corrige pas non plus les suppléments existants, dont l'un est pourtant
 * à l'envers : en Express, le Cocktail à 3,50 € coûte +2,50 € quand le Jus de
 * Gingembre à 4,50 € ne coûte que +1,50 €. L'écart vient de la hausse d'août,
 * qui a monté les jus 50 cl sans revoir les formules. Le signaler est du
 * ressort de ce script ; le corriger est une décision de prix.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Familles dont les boissons rejoignent les créneaux. */
const FAMILLE = "canettes";
/** Formule qui n'accueille pas les grands formats, et pourquoi — voir en-tête. */
const SANS_GRANDS_FORMATS = "Menu Enfant";
/** Un grand format se reconnaît à son volume, pas à son nom de marque. */
const estGrandFormat = (nom: string) => /1,5\s*L/i.test(nom);

/** Arrondi au demi-euro supérieur ou inférieur, en centimes. */
const auDemiEuro = (cents: number) => Math.round(cents / 50) * 50;

async function main() {
  console.log("— Boissons des formules —\n");

  const aProposer = await prisma.dish.findMany({
    where: { cat: FAMILLE, available: true },
    select: { id: true, name: true, priceCents: true },
    orderBy: { position: "asc" },
  });
  if (!aProposer.length) throw new Error(`Aucune boisson disponible dans la famille « ${FAMILLE} »`);

  const slots = await prisma.formulaSlot.findMany({
    include: { formula: true, choices: { include: { dish: true } } },
  });

  let ajouts = 0;

  for (const slot of slots) {
    if (!/boisson/i.test(slot.label)) continue;

    /* La boisson incluse : la moins chère de celles déjà offertes sans
     * supplément. À défaut — un créneau dont tout est payant — la moins chère
     * tout court, pour ne jamais calculer un supplément contre rien. */
    const gratuites = slot.choices.filter((c) => c.supplementCents === 0);
    const base = Math.min(
      ...(gratuites.length ? gratuites : slot.choices).map((c) => c.dish.priceCents ?? 0),
    );

    const dejaLa = new Set(slot.choices.map((c) => c.dishId));
    let position = Math.max(0, ...slot.choices.map((c) => c.position)) + 1;

    const lignes: string[] = [];
    for (const d of aProposer) {
      if (dejaLa.has(d.id)) continue;
      if (estGrandFormat(d.name) && slot.formula.name === SANS_GRANDS_FORMATS) continue;

      const supplementCents = Math.max(0, auDemiEuro((d.priceCents ?? 0) - base));
      await prisma.formulaChoice.create({
        data: { slotId: slot.id, dishId: d.id, supplementCents, position: position++ },
      });
      lignes.push(
        `   ${d.name.padEnd(20)} carte ${((d.priceCents ?? 0) / 100).toFixed(2)} €` +
          ` → supplément ${(supplementCents / 100).toFixed(2)} €`,
      );
      ajouts++;
    }

    console.log(
      `■ ${slot.formula.name} (${(slot.formula.priceCents / 100).toFixed(2)} €) / ${slot.label}` +
        ` — boisson incluse ${(base / 100).toFixed(2)} €`,
    );
    console.log(lignes.length ? lignes.join("\n") : "   rien à ajouter");
  }

  console.log(
    `\n✅ ${ajouts} choix ajouté(s).` +
      `\n   Le Menu Enfant n'a pas reçu les 1,5 L — voir l'en-tête du script.`,
  );
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
