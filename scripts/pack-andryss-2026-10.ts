/**
 * Applique le « Pack Andryss · corrections du site » du 25 octobre 2026 —
 * `npm run db:pack-andryss`.
 *
 * Règle de prix retenue par la cliente : le plus élevé entre le site et le
 * dépliant. Douze plats montent, les formules ne bougent pas. Les prix Uber
 * Eats et Deliveroo (+30 % / +15 %) n'ont pas d'existence en base : ils se
 * saisissent dans les portails.
 *
 * Ce que le script écrit :
 *  · les douze prix du tableau B ;
 *  · d12 renommé « Tajine Poulet Olives & Citron confit », prix inchangé ;
 *  · Sardines Frites (d16) retirées : supprimées, ou seulement retirées de la
 *    vente si elles ont déjà été vendues — même règle que `DELETE /api/dishes` ;
 *  · la Salade Marocaine (n° 16, 6,00 €), créée sans photo : le fichier
 *    `16_salade-marocaine.jpg` annoncé n'a pas été fourni ;
 *  · les allergènes du tableau C, **en ajout seulement** : aucun allergène déjà
 *    déclaré n'est retiré, les « à confirmer » sont saisis comme demandé ;
 *  · SIRET et numéro de TVA (à confirmer sur l'avis Sirene) ;
 *  · la promotion « −10 % à emporter » du dépliant.
 *
 * Chaque prix rappelle la valeur relevée le 25 octobre (`avant`). Si la base
 * ne la porte plus, le script s'arrête avant d'écrire : quelqu'un a bougé ce
 * prix depuis. `--force` passe outre.
 *
 *   npm run db:pack-andryss -- --dry-run   # simulation, aucune écriture
 *   npm run db:pack-andryss
 */

import { PrismaClient } from "@prisma/client";

import type { Allergen } from "../lib/types";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");

const cents = (euros: number) => Math.round(euros * 100);
const eur = (c: number | null) => (c === null ? "—" : `${(c / 100).toFixed(2)} €`);

/** Tableau B. */
const PRIX: { id: string; nom: string; avant: number; apres: number }[] = [
  { id: "d5", nom: "Patates fourrées au fromage", avant: 5.0, apres: 5.5 },
  { id: "d14", nom: "Chakchouka", avant: 5.0, apres: 6.0 },
  { id: "d15", nom: "Salade d'Aubergines (Zaalouk)", avant: 5.0, apres: 6.0 },
  { id: "d19", nom: "Thiéboudiène Poisson", avant: 12.9, apres: 13.0 },
  { id: "d29", nom: "Sandwich Merguez", avant: 6.5, apres: 7.5 },
  { id: "d30", nom: "Sandwich Brochette Poulet", avant: 7.0, apres: 8.0 },
  { id: "d32", nom: "Sandwich Brochette Bœuf", avant: 8.0, apres: 8.5 },
  { id: "d34", nom: "Alloco", avant: 4.0, apres: 5.0 },
  { id: "d39", nom: "Patate fourrée au fromage", avant: 4.0, apres: 5.5 },
  { id: "d40", nom: "Sauce Ô3 Verte", avant: 1.0, apres: 2.0 },
  { id: "d41", nom: "Sauce Ô3 Piquante", avant: 1.0, apres: 1.5 },
  { id: "d49", nom: "Ananas frais", avant: 3.0, apres: 3.5 },
];

const SALADE_MAROCAINE = {
  id: "salade-marocaine",
  cat: "medit",
  name: "Salade Marocaine",
  desc: "Tomates, concombre, oignon rouge, menthe et vinaigrette — servie avec un petit pain.",
  priceCents: 600,
  tags: JSON.stringify(["Frais", "Végétarien"]),
  allergens: JSON.stringify(["gluten", "moutarde"] satisfies Allergen[]),
};

/** Tableau C, par nom de plat tel qu'en base (● et ○ confondus). */
const ALLERGENES: Record<string, Allergen[]> = {
  "Pastels Thon": ["gluten", "oeufs", "poissons"],
  "Pastels Viande hachée": ["gluten", "oeufs", "celeri"],
  "Pastels Poulet": ["gluten", "oeufs", "celeri"],
  "Salade composée": ["moutarde"],
  "Patates fourrées au fromage": ["gluten", "oeufs", "lait"],
  Pastilla: ["gluten", "crustaces", "oeufs", "poissons", "lait", "fruits_a_coque", "sesame", "mollusques"],
  "Salade Saumon Avocat": ["gluten", "poissons", "moutarde"],
  "Salade Pâtes & Poulet": ["gluten", "oeufs", "lait", "moutarde"],
  "Salade Poulet Mozzarella": ["gluten", "lait", "moutarde"],
  "Salade César Avocat": ["gluten", "oeufs", "poissons", "lait", "moutarde"],
  "Cecina de Bœuf": ["gluten", "lait", "moutarde", "sulfites"],
  "Couscous Royal": ["gluten", "celeri", "sulfites"],
  "Couscous Poulet": ["gluten", "celeri"],
  "Tajine Veau & Pruneaux": ["gluten", "oeufs", "fruits_a_coque", "sesame"],
  "Tajine Poulet Olives & Citron confit": ["celeri", "sulfites"],
  "Tajine Boulettes de Bœuf": ["gluten", "oeufs", "celeri"],
  "Couscous Végétarien": ["gluten", "celeri"],
  Chakchouka: ["gluten", "oeufs"],
  "Salade d'Aubergines (Zaalouk)": ["gluten", "sesame"],
  "Thiéboudiène Poulet": ["poissons", "celeri", "mollusques"],
  "Thiéboudiène Bœuf": ["poissons", "celeri", "mollusques"],
  "Thiéboudiène Poisson": ["crustaces", "poissons", "celeri", "mollusques"],
  "Yassa Poulet": ["celeri", "moutarde", "sulfites"],
  "Mafé Bœuf": ["arachides", "celeri"],
  "Mafé Poulet": ["arachides", "celeri"],
  "Brochette d'agneau braisé": ["moutarde"],
  "Brochette Poulet": ["moutarde"],
  "Brochette Bœuf": ["moutarde"],
  "Ailes de Poulet": ["soja"],
  "Poisson Entier Grillé": ["poissons"],
  "Sandwich Merguez": ["gluten", "oeufs", "moutarde"],
  "Sandwich Brochette Poulet": ["gluten", "oeufs", "moutarde"],
  "Sandwich Kefta": ["gluten", "oeufs", "moutarde"],
  "Sandwich Brochette Bœuf": ["gluten", "oeufs", "moutarde"],
  "Riz Rouge": ["poissons", "celeri"],
  "Thiéboudiène blanc": ["poissons", "celeri"],
  "Salade Composée": ["moutarde"],
  "Patate fourrée au fromage": ["gluten", "oeufs", "lait"],
  "Sauce Ô3 Verte": ["oeufs", "lait", "moutarde"],
  "Sauce Ô3 Piquante": ["oeufs", "moutarde", "sulfites"],
  Tiramisu: ["gluten", "oeufs", "lait"],
  "Fondant Chocolat": ["gluten", "oeufs", "soja", "lait"],
  "Mousse au Chocolat": ["oeufs", "soja", "lait"],
  "Tarte du jour": ["gluten", "oeufs", "lait", "fruits_a_coque"],
  "Panna Cotta": ["lait"],
  "Cocktail Maison": ["sulfites"],
  "Jus d'Avocat": ["lait"],
  "Couscous marocain": ["gluten", "celeri"],
  Paella: ["crustaces", "poissons", "celeri", "mollusques"],
  "Salade Marocaine": ["gluten", "moutarde"],
};

async function main() {
  console.log(DRY ? "🔍 Simulation — aucune écriture\n" : "✍️  Application du Pack Andryss\n");

  // ── Contrôle préalable des prix : rien n'est écrit si l'un a bougé ──
  const rows = await prisma.dish.findMany({ where: { id: { in: PRIX.map((p) => p.id) } } });
  const ecarts = PRIX.filter((p) => {
    const r = rows.find((x) => x.id === p.id);
    return !r || (r.priceCents !== cents(p.avant) && r.priceCents !== cents(p.apres));
  });
  if (ecarts.length && !FORCE) {
    for (const e of ecarts) {
      const r = rows.find((x) => x.id === e.id);
      console.error(`   ✗ ${e.id} ${e.nom} : attendu ${eur(cents(e.avant))}, en base ${eur(r?.priceCents ?? null)}`);
    }
    throw new Error("Des prix ont bougé depuis le 25 octobre : rien n'a été écrit (--force pour passer outre)");
  }

  console.log("💶 Prix (tableau B)");
  for (const p of PRIX) {
    const r = rows.find((x) => x.id === p.id)!;
    if (r.priceCents === cents(p.apres)) {
      console.log(`   = ${p.nom} déjà à ${eur(cents(p.apres))}`);
      continue;
    }
    console.log(`   ${p.nom} : ${eur(r.priceCents)} → ${eur(cents(p.apres))}`);
    if (!DRY) await prisma.dish.update({ where: { id: p.id }, data: { priceCents: cents(p.apres) } });
  }

  console.log("\n🏷️  Renommage d12");
  if (!DRY) {
    await prisma.dish.update({
      where: { id: "d12" },
      data: {
        name: "Tajine Poulet Olives & Citron confit",
        desc: "Poulet mijoté aux olives et au citron confit, servi avec des frites maison.",
      },
    });
  }
  console.log("   Tajine Poulet aux Légumes → Tajine Poulet Olives & Citron confit (10,90 € inchangé)");

  console.log("\n🗑️  Sardines Frites (d16)");
  const d16 = await prisma.dish.findUnique({ where: { id: "d16" } });
  if (!d16) {
    console.log("   déjà absentes");
  } else {
    const vendues = await prisma.stockMovement.count({ where: { dishId: "d16", reason: "vente" } });
    if (vendues > 0) {
      console.log(`   déjà vendues (${vendues}) : retirées de la vente, gardées pour l'historique`);
      if (!DRY) await prisma.dish.update({ where: { id: "d16" }, data: { available: false, popular: false } });
    } else if (!DRY) {
      try {
        await prisma.dish.delete({ where: { id: "d16" } });
        console.log("   supprimées");
      } catch {
        // Encore citées par une formule ou un plat du jour : retrait de la vente.
        await prisma.dish.update({ where: { id: "d16" }, data: { available: false, popular: false } });
        console.log("   encore référencées ailleurs : retirées de la vente");
      }
    } else {
      console.log("   seront supprimées");
    }
  }

  console.log("\n🥗 Salade Marocaine");
  const existe = await prisma.dish.findUnique({ where: { id: SALADE_MAROCAINE.id } });
  if (existe) {
    console.log("   déjà présente");
  } else {
    // Elle prend la place de la n° 16, juste après le Zaalouk.
    const zaalouk = await prisma.dish.findUnique({ where: { id: "d15" }, select: { position: true } });
    console.log("   créée à 6,00 €, sans photo (16_salade-marocaine.jpg non fourni)");
    if (!DRY) {
      await prisma.dish.create({
        data: { ...SALADE_MAROCAINE, position: (zaalouk?.position ?? 14) + 1, vatRateBp: 1000 },
      });
    }
  }

  console.log("\n⚠️  Allergènes (tableau C, ajouts seulement)");
  const plats = await prisma.dish.findMany({ select: { id: true, name: true, allergens: true } });
  const nomsEnBase = new Set(plats.map((p) => p.name));
  for (const [nom, liste] of Object.entries(ALLERGENES)) {
    // La Salade Marocaine et le d12 renommé n'existent pas encore en simulation.
    if (!nomsEnBase.has(nom)) {
      if (!DRY) console.warn(`   ⚠ ${nom} absent de la base, ignoré`);
      continue;
    }
    for (const plat of plats.filter((p) => p.name === nom)) {
      const avant: string[] = JSON.parse(plat.allergens || "[]");
      const ajout = liste.filter((a) => !avant.includes(a));
      if (!ajout.length) continue;
      console.log(`   ${nom} : + ${ajout.join(", ")}`);
      if (!DRY) {
        await prisma.dish.update({
          where: { id: plat.id },
          data: { allergens: JSON.stringify([...avant, ...ajout]) },
        });
      }
    }
  }

  console.log("\n🧾 Mentions légales");
  const legal = { "legal.siret": "13113555000013", "legal.vatNumber": "FR76131135550" };
  for (const [key, value] of Object.entries(legal)) {
    console.log(`   ${key} = ${value} (à confirmer sur l'avis Sirene)`);
    if (!DRY) await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  console.log("\n🏷️  Promotion −10 % à emporter");
  const promo = await prisma.promotion.findFirst({
    where: { kind: "percent", auto: true, mode: "emporter" },
  });
  if (promo) {
    console.log(`   déjà présente (« ${promo.label} », ${promo.active ? "active" : "inactive"})`);
  } else {
    console.log("   créée : −10 % sur toute la carte à emporter, automatique");
    if (!DRY) {
      await prisma.promotion.create({
        data: {
          label: "−10 % à emporter",
          kind: "percent",
          value: 10,
          mode: "emporter",
          auto: true,
          active: true,
        },
      });
    }
  }

  console.log(DRY ? "\n✅ Simulation terminée." : "\n✅ Pack appliqué.");
}

main()
  .catch((e) => {
    console.error("\n❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
