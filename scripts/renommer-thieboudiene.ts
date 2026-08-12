/**
 * Renomme « Tcheb » en « Thiéboudiène » en base — `npm run db:thieboudiene`.
 *
 * La carte finale du 2026-08-12 (`O3-Saveurs Carte-FINALE-corrigee.pdf`) écrit
 * « Thiéboudiène » partout, là où la carte du 6 août disait « Tcheb ». Le site
 * affiche les noms de la **base**, pas ceux de `lib/menu.ts` : sans ce script,
 * le code dit Thiéboudiène et le client lit Tcheb.
 *
 * Rejouer `npm run db:seed` ferait le renommage, mais réécrirait au passage les
 * 26 prix que la cliente n'a pas validés (voir `RECONCILIATION-CARTE.md`). Ce
 * script ne touche donc qu'aux noms, et seulement à ces quatre-là.
 *
 * Ce qu'il ne touche pas, volontairement :
 *
 *  · **les lignes de commande déjà passées** (`OrderLine.name`). Ce sont des
 *    instantanés : une facture doit rester lisible telle qu'elle a été émise,
 *    dix ans durant (code de commerce). Une commande de juillet continuera donc
 *    d'afficher « Tcheb Poulet », et c'est correct ;
 *  · **les suppléments de formule**. Ils vivent en centimes dans
 *    `FormulaChoice.supplementCents` et ne sont pas indexés par le nom du plat :
 *    le supplément de 4 € du Thiéboudiène Poisson survit au renommage ;
 *  · **les descriptions**, que la cliente a pu retoucher depuis
 *    l'administration.
 *
 * Relançable sans dommage : un plat déjà renommé est simplement signalé.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Ancien nom → nom de la carte finale. */
const RENOMMAGES: ReadonlyArray<readonly [string, string]> = [
  ["Tcheb Poulet", "Thiéboudiène Poulet"],
  ["Tcheb Bœuf", "Thiéboudiène Bœuf"],
  ["Tcheb Poisson", "Thiéboudiène Poisson"],
  ["Tcheb blanc", "Thiéboudiène blanc"],
];

async function main() {
  console.log("— Renommage Tcheb → Thiéboudiène —\n");

  let renommes = 0;
  let deja = 0;
  const introuvables: string[] = [];

  for (const [ancien, nouveau] of RENOMMAGES) {
    /* On cherche l'ancien nom **et** le nouveau : le second cas est celui d'une
     * relance, ou d'un renommage déjà fait à la main dans l'administration. */
    const plat = await prisma.dish.findFirst({ where: { name: ancien } });

    if (plat) {
      await prisma.dish.update({ where: { id: plat.id }, data: { name: nouveau } });
      console.log(`✏️  « ${ancien} » → « ${nouveau} »`);
      renommes++;
      continue;
    }

    const dejaFait = await prisma.dish.findFirst({ where: { name: nouveau } });
    if (dejaFait) {
      console.log(`✓  « ${nouveau} » porte déjà le bon nom`);
      deja++;
      continue;
    }

    introuvables.push(ancien);
  }

  console.log(`\n${renommes} renommé(s), ${deja} déjà à jour.`);

  if (introuvables.length) {
    /* Ni l'ancien ni le nouveau nom : le plat a été renommé autrement, ou
     * n'existe pas dans cette base. On le dit plutôt que d'échouer — le reste
     * du renommage est valable. */
    console.log(
      `\n⚠️  Introuvable(s) en base : ${introuvables.join(", ")}.\n` +
        "   À vérifier dans /admin/plats : ces plats portent peut-être un autre\n" +
        "   nom, auquel cas le renommage est à finir à la main.",
    );
  }

  const restants = await prisma.dish.findMany({
    where: { name: { contains: "Tcheb" } },
    select: { name: true },
  });
  if (restants.length) {
    console.log(
      `\n⚠️  ${restants.length} plat(s) contiennent encore « Tcheb » : ` +
        restants.map((d) => d.name).join(", "),
    );
  } else {
    console.log("\n✅ Plus aucun « Tcheb » à la carte.");
  }
}

main()
  .catch((e) => {
    console.error("❌ échec :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
