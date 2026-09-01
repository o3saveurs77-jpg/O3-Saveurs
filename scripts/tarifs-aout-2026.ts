/**
 * Applique la grille tarifaire d'août 2026 — `npm run db:tarifs`.
 *
 * Elle vient de l'analyse concurrentielle remise par la cliente le 2026-08-28
 * (`Analyse-Concurrentielle-5km-O3-Saveurs.pdf`) : chaque plat est repositionné
 * 1,00 à 1,50 € sous le concurrent direct le moins cher dans un rayon de 5 km.
 * Seuls les **prix maîtres** figurent ici — site, comptoir et livraison en
 * propre. Les prix Uber Eats du document se règlent sur la plateforme, ils
 * n'ont pas d'existence en base.
 *
 * La base est la seule source de vérité de la carte : ce script y écrit
 * directement, sans passer par le seed. `lib/menu.ts` est mis à jour en
 * parallèle pour la même grille, afin qu'un `db:seed` rejoué un jour ne
 * ressuscite pas les anciens prix.
 *
 * Il se relance sans dommage : il écrit un prix cible, pas un écart. Chaque
 * ligne annonce l'ancien et le nouveau prix, et un plat déjà à son prix cible
 * est signalé « déjà à jour » sans écriture.
 *
 * Le prix relevé au 2026-08-28 est rappelé pour chaque plat (`avant`). S'il ne
 * correspond plus à la base, le script **s'arrête avant d'écrire** : cela veut
 * dire que quelqu'un a bougé ce prix depuis, et écraser ce geste sans le dire
 * serait pire que de ne rien faire. `--force` passe outre.
 *
 * Usage :
 *   npm run db:tarifs                                  # base de `.env` (Neon, dev)
 *   npm run db:tarifs -- --dry-run                     # simulation, aucune écriture
 *   npm run db:tarifs -- --env=.env.production.local   # base de l'hébergeur
 */

import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { items } from "../lib/menu";
import { ALLERGENES_PAR_PLAT } from "../lib/allergenes";

/**
 * Choix explicite de la base — même précaution que `scripts/section-sur-commande.ts`.
 * Le projet en tient deux, celle de `.env` (Neon, développement) et celle de
 * l'hébergeur : sans cette option, Prisma prend la première et la nouvelle
 * grille n'atteindrait jamais le site.
 */
function urlDepuis(fichier: string): string {
  const m = readFileSync(fichier, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error(`DATABASE_URL absente de ${fichier}`);
  return m[1];
}

const args = process.argv.slice(2);
const fichierEnv = args.find((a) => a.startsWith("--env="))?.slice("--env=".length);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const url = fichierEnv ? urlDepuis(fichierEnv) : undefined;

const prisma = url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();

const cents = (euros: number) => Math.round(euros * 100);
const eur = (c: number | null) => (c === null ? "—" : `${(c / 100).toFixed(2)} €`);

/** Un prix cible, avec le prix relevé au moment de l'analyse. */
interface Tarif {
  id: string;
  avant: number;
  apres: number;
}

/**
 * Plats dont le prix change. L'ordre suit celui du document, section 5.
 *
 * Absents volontairement — le document les conserve tels quels (section 6) :
 * salade composée, chakchouka, zaalouk, cuisse, pilon, ailes, sandwichs,
 * accompagnements, sauces, piment, cocktail, jus d'orange, jus d'avocat,
 * canettes, panna cotta. Ainsi que le Poisson Entier Grillé (d28), dorade
 * entière au feu de bois sans équivalent à 5 km : premium assumé, 18 € gardés.
 */
const TARIFS: Tarif[] = [
  // Afrique de l'Ouest
  { id: "d20", avant: 8.5, apres: 9.9 }, // Yassa Poulet
  { id: "d17", avant: 8.5, apres: 10.9 }, // Thiéboudiène Poulet
  { id: "d18", avant: 9.5, apres: 11.9 }, // Thiéboudiène Bœuf
  { id: "d21", avant: 9.5, apres: 11.9 }, // Mafé Bœuf
  /* Seule baisse de la grille : à 12,90 € le Thiéboudiène Poisson passe sous
   * African Evasion (13 €) et 1,10 € sous son poisson braisé. Le poisson frais
   * interdit de descendre plus bas sans casser la marge. */
  { id: "d19", avant: 13, apres: 12.9 }, // Thiéboudiène Poisson

  // Maghreb
  { id: "d12", avant: 9, apres: 10.9 }, // Tajine Poulet aux Légumes
  { id: "d13", avant: 9.5, apres: 11.5 }, // Tajine Boulettes de Bœuf
  { id: "d11", avant: 10.5, apres: 12.9 }, // Tajine Veau & Pruneaux

  // Méditerranée
  { id: "d16", avant: 8, apres: 8.5 }, // Sardines Frites

  // Grillades
  { id: "d24", avant: 8, apres: 9.9 }, // Poulet Rôti
  { id: "d22", avant: 7, apres: 8.5 }, // Brochette Poulet
  { id: "d23", avant: 8, apres: 9.5 }, // Brochette Bœuf

  // Salades & bowls
  { id: "d9", avant: 9, apres: 9.9 }, // Salade César Avocat
  { id: "d6", avant: 9, apres: 10.9 }, // Salade Saumon Avocat
  { id: "d10", avant: 10, apres: 11.5 }, // Cecina de Bœuf
  { id: "d7", avant: 8.4, apres: 9.5 }, // Salade Pâtes & Poulet
  { id: "d8", avant: 8.4, apres: 9.5 }, // Salade Poulet Mozzarella

  /* Entrées. La patate fourrée existe en deux plats : l'entrée de six pièces
   * monte à 5 €, l'accompagnement du même nom (d39) reste à 4 € — le document
   * les distingue, la base aussi. */
  { id: "d1", avant: 6, apres: 7 }, // Pastels Thon
  { id: "d2", avant: 7, apres: 7.5 }, // Pastels Viande hachée
  { id: "d3", avant: 7, apres: 7.5 }, // Pastels Poulet
  { id: "d5", avant: 4, apres: 5 }, // Patates fourrées au fromage (entrée)

  // Desserts
  { id: "d50", avant: 2.5, apres: 3.5 }, // Tiramisu
  { id: "d51", avant: 3, apres: 3.9 }, // Fondant Chocolat
  { id: "d52", avant: 3, apres: 3.5 }, // Mousse au Chocolat
  { id: "d53", avant: 3, apres: 3.5 }, // Tarte du jour
  { id: "d49", avant: 2.5, apres: 3 }, // Ananas frais

  /* Boissons maison en 50 cl. Les 25 cl (cocktail, jus d'orange, jus d'avocat)
   * sont conservés : le document les juge déjà bien placés. */
  { id: "d43", avant: 3.5, apres: 4.5 }, // Jus de Gingembre
  { id: "d44", avant: 3.5, apres: 4.5 }, // Jus de Bissap

  // Accompagnements — seul le riz blanc bouge
  { id: "d33", avant: 2.5, apres: 3 }, // Riz Blanc

  /* Sur commande (document, section 8). Les prix restent sous le marché
   * traiteur relevé en Île-de-France, gigot et couscous étaient les plus
   * décrochés. */
  { id: "sc-gigot", avant: 70, apres: 85 },
  { id: "sc-epaule", avant: 60, apres: 70 },
  { id: "sc-couscous", avant: 65, apres: 85 },
  { id: "sc-paella", avant: 75, apres: 90 },
  { id: "sc-demi-agneau", avant: 220, apres: 240 },
  { id: "sc-agneau-entier", avant: 420, apres: 450 },
];

/**
 * Formules (document, section 7). F4 Sandwich et F5 Menu Enfant sont
 * conservées : le document les réserve au canal direct comme argument de
 * migration hors plateforme, à prix inchangé.
 */
const FORMULES: { code: string; avant: number; apres: number }[] = [
  { code: "F1", avant: 10.9, apres: 12.9 },
  { code: "F2", avant: 13.9, apres: 15.9 },
  { code: "F3", avant: 16.9, apres: 18.9 },
];

/**
 * Les quatre plats que le relevé concurrent a révélés manquants — African
 * Evasion vend un mafé poulet et un agneau braisé que la carte n'a pas, et
 * L'Étoile du Maroc deux couscous à 18 €.
 *
 * Leur définition complète (description, tags, allergènes) vit dans
 * `lib/menu.ts` : ce script n'en reprend que l'identifiant, le prix et le plat
 * après lequel se ranger. Deux descriptions du même plat finiraient par
 * diverger.
 *
 * `apres` rappelle le prix de lancement du document ; il doit correspondre à
 * celui de `lib/menu.ts`, sinon le script s'arrête.
 */
const NOUVEAUX: { id: string; apres: number; apresPlat: string }[] = [
  { id: "mafe-poulet", apres: 10.9, apresPlat: "Mafé Bœuf" },
  { id: "couscous-poulet", apres: 11.9, apresPlat: "Tajine Veau & Pruneaux" },
  { id: "couscous-royal", apres: 13.9, apresPlat: "Tajine Veau & Pruneaux" },
  { id: "agneau-braise", apres: 13.5, apresPlat: "Brochette Poulet" },
];

const ecarts: string[] = [];

async function majPlats() {
  console.log("— Plats —\n");
  const plats = await prisma.dish.findMany({
    where: { id: { in: TARIFS.map((t) => t.id) } },
    select: { id: true, name: true, priceCents: true },
  });
  const parId = new Map(plats.map((p) => [p.id, p]));

  for (const t of TARIFS) {
    const plat = parId.get(t.id);
    if (!plat) {
      ecarts.push(`plat ${t.id} absent de la base`);
      continue;
    }
    if (plat.priceCents === cents(t.apres)) {
      console.log(`  ·  ${plat.name} — déjà à ${eur(plat.priceCents)}`);
      continue;
    }
    if (plat.priceCents !== cents(t.avant)) {
      ecarts.push(
        `${plat.name} (${t.id}) est à ${eur(plat.priceCents)} en base, ` +
          `le document partait de ${t.avant.toFixed(2)} €` +
          (FORCE ? " — écrasé (--force)" : ""),
      );
      if (!FORCE) continue;
    }
    console.log(`  ✎  ${plat.name} — ${eur(plat.priceCents)} → ${eur(cents(t.apres))}`);
    if (!DRY) {
      await prisma.dish.update({ where: { id: t.id }, data: { priceCents: cents(t.apres) } });
    }
  }
}

async function majFormules() {
  console.log("\n— Formules —\n");
  for (const f of FORMULES) {
    const formule = await prisma.formula.findUnique({ where: { code: f.code } });
    if (!formule) {
      ecarts.push(`formule ${f.code} absente de la base`);
      continue;
    }
    if (formule.priceCents === cents(f.apres)) {
      console.log(`  ·  ${f.code} ${formule.name} — déjà à ${eur(formule.priceCents)}`);
      continue;
    }
    if (formule.priceCents !== cents(f.avant)) {
      ecarts.push(
        `formule ${f.code} est à ${eur(formule.priceCents)} en base, ` +
          `le document partait de ${f.avant.toFixed(2)} €` +
          (FORCE ? " — écrasé (--force)" : ""),
      );
      if (!FORCE) continue;
    }
    console.log(`  ✎  ${f.code} ${formule.name} — ${eur(formule.priceCents)} → ${eur(cents(f.apres))}`);
    if (!DRY) {
      await prisma.formula.update({ where: { code: f.code }, data: { priceCents: cents(f.apres) } });
    }
  }
}

/**
 * Crée les quatre nouveaux plats, s'ils n'existent pas déjà.
 *
 * Ils ne sont **pas** rattachés aux créneaux des formules. Le Couscous Royal à
 * 13,90 € et l'Agneau Braisé à 13,50 € dépassent la F1 Express à 12,90 € : les
 * y glisser sans supplément vendrait la formule à perte. La cliente les y
 * ajoutera depuis l'administration si elle le souhaite, en fixant le
 * supplément — c'est aussi ce que prévoit `FORMULA_SUPPLEMENTS` pour un seed
 * rejoué.
 *
 * `position` est celle du plat après lequel ils se rangent : l'égalité est
 * départagée par le nom (`orderBy: [position, name]`), ce qui les place dans
 * leur famille sans renuméroter toute la carte.
 */
async function creerNouveaux() {
  console.log("\n— Nouveaux plats —\n");
  for (const n of NOUVEAUX) {
    const seed = items.find((i) => i.id === n.id);
    if (!seed) {
      ecarts.push(`${n.id} introuvable dans lib/menu.ts`);
      continue;
    }
    if (seed.price !== n.apres) {
      ecarts.push(
        `${seed.name} : ${n.apres.toFixed(2)} € ici, ${seed.price?.toFixed(2)} € dans lib/menu.ts`,
      );
      continue;
    }

    const existant = await prisma.dish.findUnique({ where: { id: n.id } });
    if (existant) {
      console.log(`  ·  ${seed.name} — déjà en base à ${eur(existant.priceCents)}`);
      continue;
    }

    const ancre = await prisma.dish.findFirst({
      where: { name: n.apresPlat },
      select: { position: true },
    });
    if (!ancre) {
      ecarts.push(`plat de référence « ${n.apresPlat} » introuvable pour ${seed.name}`);
      continue;
    }

    console.log(`  +  ${seed.name} — ${eur(cents(n.apres))} (famille « ${seed.cat} »)`);
    if (!DRY) {
      await prisma.dish.create({
        data: {
          id: seed.id,
          cat: seed.cat,
          name: seed.name,
          desc: seed.desc,
          priceCents: cents(n.apres),
          photo: seed.photo,
          badge: seed.badge,
          popular: seed.popular,
          available: seed.available,
          spice: seed.spice,
          tags: JSON.stringify(seed.tags),
          options: JSON.stringify(seed.options),
          allergens: JSON.stringify(ALLERGENES_PAR_PLAT[seed.name] ?? []),
          vatRateBp: seed.vatRateBp ?? 1000,
          leadTimeHours: seed.leadTimeHours ?? 0,
          position: ancre.position,
        },
      });
    }
  }
}

async function main() {
  console.log(
    `\n=== Grille tarifaire août 2026 ===\n` +
      `Base   : ${fichierEnv ?? ".env"}\n` +
      `Mode   : ${DRY ? "simulation (aucune écriture)" : "écriture"}${FORCE ? " · --force" : ""}\n`,
  );

  await majPlats();
  await majFormules();
  await creerNouveaux();

  if (ecarts.length) {
    console.log(`\n⚠️  ${ecarts.length} écart(s) avec le document :\n   ` + ecarts.join("\n   "));
    if (!FORCE) {
      console.log(
        "\n   Ces lignes n'ont pas été touchées. Vérifiez-les, puis relancez\n" +
          "   (`--force` applique quand même le reste).",
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log(DRY ? "\n✅ Simulation terminée." : "\n✅ Grille appliquée.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
