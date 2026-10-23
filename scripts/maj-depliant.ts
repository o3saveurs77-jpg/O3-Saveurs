/* Alignement des données en base sur le dépliant 2026.
 *
 * Deux choses à remettre à jour, et le seed complet ne convient pour aucune :
 *  · les **prix des formules** — `npm run db:seed` les mettrait bien à jour,
 *    mais il réécrit au passage tout le catalogue (positions, options, tags…) ;
 *  · les **horaires d'ouverture** — que le seed, lui, ne touche jamais une fois
 *    créés (ils sont considérés comme un choix de la cliente).
 *
 * Ce script ne touche donc QUE les formules et les horaires. Il est idempotent
 * et non destructif : on peut le rejouer sans risque.
 *
 *   npm run db:depliant
 */

import { PrismaClient } from "@prisma/client";
import { seedFormulas } from "../lib/menu";
import { DEFAULT_HOURS } from "../lib/hours";

const prisma = new PrismaClient();
const cents = (euros: number) => Math.round(euros * 100);

async function majFormules() {
  console.log("🍱 Prix et libellés des formules…");
  for (const f of seedFormulas) {
    try {
      await prisma.formula.update({
        where: { code: f.code },
        data: {
          name: f.name,
          desc: f.desc,
          extra: f.extra,
          priceCents: cents(f.price),
        },
      });
      console.log(`   ${f.code} ${f.name} → ${f.price.toFixed(2).replace(".", ",")} €`);
    } catch {
      console.warn(`   ⚠ formule ${f.code} absente en base, ignorée`);
    }
  }
}

async function majHoraires() {
  console.log("🕒 Horaires d'ouverture…");
  for (const h of DEFAULT_HOURS) {
    await prisma.openingHours.upsert({
      where: { weekday: h.weekday },
      create: h,
      update: {
        closed: h.closed,
        lunchOpen: h.lunchOpen,
        lunchClose: h.lunchClose,
        dinnerOpen: h.dinnerOpen,
        dinnerClose: h.dinnerClose,
      },
    });
  }
  console.log("   lundi–samedi 11h30–14h30 · 18h00–22h30, dimanche fermé");
}

async function main() {
  console.log("🔄 Alignement sur le dépliant (formules + horaires)…\n");
  await majFormules();
  await majHoraires();
  console.log("\n✅ Base alignée sur le dépliant. Aucune autre donnée modifiée.");
}

main()
  .catch((e) => {
    console.error("\n❌ Mise à jour interrompue :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
