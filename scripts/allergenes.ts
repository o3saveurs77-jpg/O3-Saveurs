/**
 * Verse la transcription du tableau des allergènes en base —
 * `npm run db:allergenes`.
 *
 * Les 68 plats avaient un champ allergènes vide, alors que les CGV et les
 * mentions légales promettent cette information. Ce script la pose une fois ;
 * ensuite, la source de vérité est la base, modifiable depuis *Admin → Plats*.
 *
 * **Il n'écrase que ce qui est vide.** Un plat dont les allergènes ont déjà
 * été saisis — par ce script hier, ou à la main dans le back-office — est
 * laissé tel quel : une relance ne doit pas défaire une correction apportée
 * par la cuisine, qui connaît ses recettes mieux qu'un tableau.
 *
 * Passer `--force` pour réécrire malgré tout, ce qui n'a de sens qu'après une
 * mise à jour délibérée de `lib/allergenes.ts`.
 */

import { PrismaClient } from "@prisma/client";

import { ALLERGENES_PAR_PLAT } from "../lib/allergenes";
import { ALLERGENS } from "../lib/types";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function main() {
  console.log(`— Allergènes en base${FORCE ? " (--force)" : ""} —\n`);

  /* Garde-fou : une faute de frappe dans la transcription passerait sinon en
   * base sans bruit, et s'afficherait comme un allergène inconnu. */
  const connus = new Set<string>(ALLERGENS);
  const invalides = Object.entries(ALLERGENES_PAR_PLAT).flatMap(([plat, liste]) =>
    liste.filter((a) => !connus.has(a)).map((a) => `${plat} → « ${a} »`),
  );
  if (invalides.length) {
    throw new Error(`Allergènes inconnus dans lib/allergenes.ts :\n  ${invalides.join("\n  ")}`);
  }

  const plats = await prisma.dish.findMany({ select: { id: true, name: true, allergens: true } });
  const enBase = new Map(plats.map((p) => [p.name, p]));

  let poses = 0;
  let conserves = 0;
  const absentsDeLaBase: string[] = [];

  for (const [nom, liste] of Object.entries(ALLERGENES_PAR_PLAT)) {
    const plat = enBase.get(nom);
    if (!plat) {
      absentsDeLaBase.push(nom);
      continue;
    }

    const dejaSaisi = plat.allergens && plat.allergens !== "[]";
    if (dejaSaisi && !FORCE) {
      conserves++;
      continue;
    }

    await prisma.dish.update({
      where: { id: plat.id },
      data: { allergens: JSON.stringify(liste) },
    });
    poses++;
  }

  console.log(`✅ ${poses} plat(s) renseigné(s)${conserves ? `, ${conserves} conservé(s) tels quels` : ""}`);

  if (absentsDeLaBase.length) {
    console.log(
      `\n⚠️  ${absentsDeLaBase.length} nom(s) de la transcription sans plat correspondant :\n   ` +
        absentsDeLaBase.join("\n   ") +
        "\n   (nom changé en base ? plat retiré ? — à corriger dans lib/allergenes.ts)",
    );
  }

  const sansTranscription = plats
    .filter((p) => !(p.name in ALLERGENES_PAR_PLAT))
    .map((p) => p.name);
  if (sansTranscription.length) {
    console.log(
      `\nℹ️  ${sansTranscription.length} plat(s) absent(s) du tableau, laissés vides :\n   ` +
        sansTranscription.join(", ") +
        "\n   Une liste vide n'affirme rien : la page les signale comme non renseignés.",
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ échec :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
