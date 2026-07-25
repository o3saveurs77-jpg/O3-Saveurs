/* Jeu de démonstration — **jamais en production**.
 *
 * Les commandes fictives étaient auparavant créées par le seed principal, dans
 * la même table que les vraies, avec `paid: true` et des montants crédibles.
 * Elles gonflaient le chiffre d'affaires du tableau de bord, la liste des
 * clients et l'écran de facturation : aucun chiffre du back-office n'était
 * exploitable. Elles vivent désormais ici, derrière un garde-fou explicite.
 *
 *   npm run db:seed:demo          → crée le jeu de démonstration
 *   npm run db:seed:demo -- --purge  → le supprime (et lui seul)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { OrderLine, OrderStatus } from "../lib/types";

const prisma = new PrismaClient();

/** Préfixe qui rend les données de démonstration reconnaissables et purgeables. */
const DEMO_REF_PREFIX = "#DEMO";
const DEMO_EMAIL = "awa.diallo@email.com";

const DEMO_CUSTOMERS = [
  { name: "Awa Diallo", email: DEMO_EMAIL, phone: "0612345678", address: "12 rue des Acacias", zip: "77185", city: "Lognes" },
  { name: "Karim Benali", email: "karim.benali@email.com", phone: "0623456789", address: "5 allée des Tilleuls", zip: "77186", city: "Noisiel" },
  { name: "Sophie Marchand", email: "sophie.marchand@email.com", phone: "0634567890", address: "18 av. de l'Europe", zip: "77420", city: "Champs-sur-Marne" },
  { name: "Mehdi Cherif", email: "mehdi.cherif@email.com", phone: "0645678901", address: "3 rue du Moulin", zip: "77200", city: "Torcy" },
  { name: "Élodie Fontaine", email: "elodie.fontaine@email.com", phone: "0656789012", address: "27 rue Pasteur", zip: "77600", city: "Bussy-Saint-Georges" },
];

const DEMO_DRIVERS = [
  { name: "Samir", phone: "0611111111", vehicle: "Scooter" },
  { name: "Kevin", phone: "0622222222", vehicle: "Voiture" },
  { name: "Dramane", phone: "0633333333", vehicle: "Scooter" },
];

function guard() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refus : ce script crée des commandes fictives, il ne doit jamais tourner\n" +
        "en production. Elles seraient indistinguables des vraies dans la\n" +
        "comptabilité du restaurant.",
    );
  }
}

async function purge() {
  const orders = await prisma.order.deleteMany({ where: { ref: { startsWith: DEMO_REF_PREFIX } } });
  const runs = await prisma.deliveryRun.deleteMany({ where: { notes: "demo" } });
  console.log(`🧹 ${orders.count} commandes et ${runs.count} tournées de démonstration supprimées.`);
}

/** Générateur déterministe : le même appel produit toujours le même jeu. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function main() {
  guard();

  if (process.argv.includes("--purge")) {
    await purge();
    return;
  }

  const dishes = await prisma.dish.findMany({
    where: { available: true, priceCents: { not: null } },
    take: 40,
  });
  if (!dishes.length) {
    throw new Error("Catalogue vide : lancez `npm run db:seed` avant le jeu de démonstration.");
  }

  const zones = await prisma.zone.findMany({ orderBy: { idx: "asc" } });

  // ─── Client de démonstration ───
  const hash = await bcrypt.hash("demo1234", 12);
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      name: "Awa Diallo",
      email: DEMO_EMAIL,
      phone: "0612345678",
      password: hash,
      role: "CLIENT",
      favorites: JSON.stringify(dishes.slice(0, 2).map((d) => d.id)),
      addresses: JSON.stringify([
        { id: "a1", label: "Domicile", address: "12 rue des Acacias", zip: "77185", city: "Lognes" },
        { id: "a2", label: "Bureau", address: "3 av. de l'Europe", zip: "77420", city: "Champs-sur-Marne" },
      ]),
    },
    update: { password: hash },
  });
  console.log(`👤 Client de démonstration : ${DEMO_EMAIL} / demo1234`);

  // ─── Livreurs ───
  for (const d of DEMO_DRIVERS) {
    const existing = await prisma.driver.findFirst({ where: { name: d.name } });
    if (!existing) await prisma.driver.create({ data: d });
  }
  const drivers = await prisma.driver.findMany();
  console.log(`🛵 ${drivers.length} livreurs.`);

  // ─── Promotions ───
  const promos = [
    { code: "BIENVENUE10", label: "-10 % sur la première commande", kind: "percent", value: 10, minSubtotalCents: 2000, oncePerCustomer: true },
    { code: "LIVRAISONOFFERTE", label: "Livraison offerte", kind: "free_delivery", value: 0, minSubtotalCents: 3000 },
    { code: null, label: "Mardi gourmand : -15 %", kind: "percent", value: 15, minSubtotalCents: 2500, weekday: 2, auto: true },
  ];
  for (const p of promos) {
    if (p.code) {
      await prisma.promotion.upsert({ where: { code: p.code }, create: p, update: {} });
    } else {
      const existing = await prisma.promotion.findFirst({ where: { label: p.label } });
      if (!existing) await prisma.promotion.create({ data: p });
    }
  }
  console.log(`🏷️  ${promos.length} promotions.`);

  // ─── Commandes ───
  const rng = makeRng(20260725);
  const statuses: OrderStatus[] = ["livree", "livree", "livree", "route", "cuisine", "confirmee", "annulee"];
  const DAY = 86_400_000;
  const count = 60;

  await purge(); // évite les doublons si le script est relancé

  for (let i = 0; i < count; i++) {
    const customer = DEMO_CUSTOMERS[Math.floor(rng() * DEMO_CUSTOMERS.length)];
    const status = statuses[Math.floor(rng() * statuses.length)];
    const mode = rng() > 0.3 ? "livraison" : "emporter";
    const createdAt = new Date(Date.now() - Math.floor(rng() * 30) * DAY - Math.floor(rng() * 8) * 3_600_000);

    const lineCount = 1 + Math.floor(rng() * 3);
    const lines: OrderLine[] = [];
    for (let j = 0; j < lineCount; j++) {
      const dish = dishes[Math.floor(rng() * dishes.length)];
      const qty = 1 + Math.floor(rng() * 2);
      const unit = dish.priceCents ?? 0;
      lines.push({
        dishId: dish.id,
        name: dish.name,
        photo: dish.photo,
        unitPriceCents: unit,
        qty,
        lineTotalCents: unit * qty,
        opts: {},
        formule: null,
        note: "",
      });
    }

    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const zone = mode === "livraison" ? zones[Math.floor(rng() * zones.length)] : null;
    const feeCents = zone?.feeCents ?? 0;
    const totalCents = subtotalCents + feeCents;
    const paid = status === "livree" || status === "route";

    await prisma.order.create({
      data: {
        ref: `${DEMO_REF_PREFIX}${String(i).padStart(3, "0")}`,
        userId: customer.email === DEMO_EMAIL ? demoUser.id : null,
        mode,
        status,
        zoneIdx: zone?.idx ?? null,
        slot: rng() > 0.5 ? "asap" : "19:30",
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        address: mode === "livraison" ? customer.address : null,
        city: mode === "livraison" ? customer.city : null,
        zip: mode === "livraison" ? customer.zip : null,
        subtotalCents,
        feeCents,
        totalCents,
        paid,
        paymentStatus: paid ? "paye" : "en_attente",
        paymentMethod: rng() > 0.4 ? "Carte bancaire" : "Espèces sur place",
        driverId: status === "route" || status === "livree" ? drivers[Math.floor(rng() * drivers.length)]?.id ?? null : null,
        lines: JSON.stringify(lines),
        createdAt,
        confirmedAt: createdAt,
        deliveredAt: status === "livree" ? new Date(createdAt.getTime() + 45 * 60_000) : null,
        canceledAt: status === "annulee" ? new Date(createdAt.getTime() + 5 * 60_000) : null,
      },
    });
  }
  console.log(`🧾 ${count} commandes de démonstration (référence ${DEMO_REF_PREFIX}…).`);

  // ─── Stocks de démonstration ───
  for (const dish of dishes.slice(0, 12)) {
    await prisma.dish.update({
      where: { id: dish.id },
      data: { stock: Math.floor(rng() * 25), stockAlert: 5 },
    });
  }
  console.log("📦 Stocks initialisés sur 12 plats.");

  console.log("\n✅ Jeu de démonstration prêt. Purge : npm run db:seed:demo -- --purge");
}

main()
  .catch((e) => {
    console.error("\n❌ Interrompu :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
