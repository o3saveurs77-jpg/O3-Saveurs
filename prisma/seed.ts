/* Seed du catalogue — **idempotent et non destructif**.
 *
 * La version précédente commençait par `deleteMany()` sur les commandes, les
 * plats, les zones et **les comptes clients**, et `DEPLOY.md` prescrivait de la
 * lancer sur la base de production. Rejouée après le lancement — redéploiement,
 * nouvel environnement, reprise après incident — elle effaçait toute la
 * comptabilité du restaurant.
 *
 * Ce script est donc conçu pour être relancé sans risque : il fait des `upsert`
 * et ne supprime jamais rien. Les commandes et comptes de démonstration sont
 * dans `seed-demo.ts`, qui refuse de s'exécuter en production.
 *
 *   npm run db:seed        → catalogue, zones, horaires, réglages, admin
 *   npm run db:seed:demo   → jeu de démonstration (dev uniquement)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { items, zones, platsDuJour, cats } from "../lib/menu";
import { DEFAULT_HOURS } from "../lib/hours";
import { SETTING_DEFAULTS } from "../lib/settings";

const prisma = new PrismaClient();

const WEEKDAY: Record<string, number> = {
  Dimanche: 0,
  Lundi: 1,
  Mardi: 2,
  Mercredi: 3,
  Jeudi: 4,
  Vendredi: 5,
  Samedi: 6,
};

/** Euros du jeu de données → centimes stockés. */
const cents = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Math.round(v * 100);

function resolveAdminCredentials(): { email: string; password: string } {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans l'environnement.\n" +
        "Aucune valeur par défaut n'est fournie : un mot de passe d'administration\n" +
        "documenté serait un compte ouvert sur toutes les données clients.",
    );
  }
  if (password.length < 12) {
    throw new Error(
      `ADMIN_PASSWORD fait ${password.length} caractères. Minimum 12 : ce compte\n` +
        "donne accès à l'intégralité du fichier clients et de la comptabilité.",
    );
  }
  return { email, password };
}

async function seedCategories() {
  console.log(`📂 ${cats.length} catégories…`);
  for (const [i, c] of cats.entries()) {
    await prisma.category.upsert({
      where: { slug: c.id },
      create: { slug: c.id, label: c.label, script: c.script, position: i },
      // On ne réécrit pas `active` : la cliente a pu masquer une catégorie.
      update: { label: c.label, script: c.script, position: i },
    });
  }
}

async function seedDishes() {
  console.log(`🍽️  ${items.length} plats…`);
  for (const [i, d] of items.entries()) {
    const data = {
      cat: d.cat,
      name: d.name,
      desc: d.desc,
      priceCents: cents(d.price),
      photo: d.photo,
      badge: d.badge,
      popular: d.popular,
      spice: d.spice,
      tags: JSON.stringify(d.tags),
      options: JSON.stringify(
        d.options.map((o) => ({
          name: o.name,
          required: o.required,
          choices: o.choices.map((c) => ({ l: c.l, priceCents: cents(c.price) ?? undefined })),
        })),
      ),
      formules: d.formules
        ? JSON.stringify(d.formules.map(([label, price]) => [label, cents(price) ?? 0]))
        : null,
      allergens: JSON.stringify(d.allergens ?? []),
      position: i,
    };

    await prisma.dish.upsert({
      where: { id: d.id },
      // `available`, `stock` et `costCents` sont laissés à la base : ils sont
      // pilotés au quotidien depuis l'admin et ne doivent pas être réécrasés.
      create: { id: d.id, ...data, available: d.available },
      update: data,
    });
  }
}

async function seedZones() {
  console.log(`🚚 ${zones.length} zones…`);
  for (const [i, z] of zones.entries()) {
    const data = {
      feeCents: cents(z.fee) ?? 0,
      minimumCents: cents(z.min) ?? 0,
      cities: JSON.stringify(z.villes),
      zips: JSON.stringify(z.zips ?? []),
    };
    await prisma.zone.upsert({
      where: { idx: i },
      create: { idx: i, ...data },
      update: data,
    });
  }
}

async function seedHours() {
  console.log("🕒 horaires d'ouverture…");
  for (const h of DEFAULT_HOURS) {
    await prisma.openingHours.upsert({
      where: { weekday: h.weekday },
      create: h,
      update: {}, // horaires déjà en base = choix de la cliente, on n'y touche pas
    });
  }
}

async function seedSettings() {
  console.log("⚙️  réglages…");
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: {}, // ne jamais écraser un réglage saisi par la cliente
    });
  }
}

async function seedDailySpecials() {
  console.log(`⭐ ${platsDuJour.length} plats du jour…`);
  for (const [i, p] of platsDuJour.entries()) {
    const weekday = WEEKDAY[p.jour] ?? 0;
    const existing = await prisma.dailySpecial.findFirst({ where: { weekday, name: p.nom } });
    if (existing) continue;
    await prisma.dailySpecial.create({
      data: { weekday, name: p.nom, priceCents: null, active: true, position: i },
    });
  }
}

async function seedAdmin() {
  const { email, password } = resolveAdminCredentials();
  const hash = await bcrypt.hash(password, 12);
  console.log(`👤 Admin : ${email}`);
  await prisma.user.upsert({
    where: { email },
    create: { name: "Laila", email, phone: "01 72 84 52 44", password: hash, role: "ADMIN" },
    // Le mot de passe est réaligné sur l'environnement, mais le rôle et le
    // compte existant sont préservés.
    update: { password: hash, role: "ADMIN" },
  });
}

async function main() {
  console.log("🌱 Seed du catalogue (idempotent, aucune suppression)…\n");
  await seedCategories();
  await seedDishes();
  await seedZones();
  await seedHours();
  await seedSettings();
  await seedDailySpecials();
  await seedAdmin();
  console.log("\n✅ Seed terminé. Aucune donnée existante n'a été supprimée.");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed interrompu :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
