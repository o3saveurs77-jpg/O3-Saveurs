/* Seed de la base — peuple le catalogue, les zones, les plats du jour,
   un compte client démo et un historique de commandes pour le back-office. */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { items, zones, platsDuJour } from "../lib/menu";
import { generateDemoOrders, DEMO_EMAIL } from "../lib/mockOrders";

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@o3saveurs.fr").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin1234";

const WEEKDAY: Record<string, number> = {
  Dimanche: 0,
  Lundi: 1,
  Mardi: 2,
  Mercredi: 3,
  Jeudi: 4,
  Vendredi: 5,
  Samedi: 6,
};

async function main() {
  console.log("🌱 Réinitialisation…");
  await prisma.order.deleteMany();
  await prisma.dish.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.dailySpecial.deleteMany();
  await prisma.user.deleteMany();

  // ─── Plats ───
  console.log(`🍽️  ${items.length} plats…`);
  await prisma.dish.createMany({
    data: items.map((d, i) => ({
      id: d.id,
      cat: d.cat,
      name: d.name,
      desc: d.desc,
      price: d.price,
      photo: d.photo,
      badge: d.badge,
      popular: d.popular,
      available: d.available,
      spice: d.spice,
      tags: JSON.stringify(d.tags),
      options: JSON.stringify(d.options),
      formules: d.formules ? JSON.stringify(d.formules) : null,
      position: i,
    })),
  });

  // ─── Zones ───
  console.log(`🚚 ${zones.length} zones…`);
  await prisma.zone.createMany({
    data: zones.map((z, i) => ({
      idx: i,
      fee: z.fee,
      minimum: z.min,
      cities: JSON.stringify(z.villes),
    })),
  });

  // ─── Plats du jour ───
  await prisma.dailySpecial.createMany({
    data: platsDuJour.map((p) => ({
      weekday: WEEKDAY[p.jour] ?? 0,
      name: p.nom,
      price: null,
      active: true,
    })),
  });

  // ─── Utilisateurs ───
  const demoHash = await bcrypt.hash("demo1234", 10);
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  console.log(`👤 Admin : ${ADMIN_EMAIL}`);
  await prisma.user.createMany({
    data: [
      {
        name: "Awa Diallo",
        email: DEMO_EMAIL,
        phone: "06 12 34 56 78",
        password: demoHash, // compte démo client — mot de passe : demo1234
        role: "CLIENT",
        favorites: JSON.stringify([items[5].id, items[18].id]),
        addresses: JSON.stringify([
          { id: "a1", label: "Domicile", address: "12 rue des Acacias", zip: "77185", city: "Lognes" },
          { id: "a2", label: "Bureau", address: "3 av. de l'Europe", zip: "77420", city: "Champs-sur-Marne" },
        ]),
      },
      {
        name: "Laila (Admin)",
        email: ADMIN_EMAIL,
        phone: "01 72 84 52 44",
        password: adminHash, // mot de passe : ADMIN_PASSWORD (.env)
        role: "ADMIN",
        favorites: "[]",
        addresses: "[]",
      },
    ],
  });

  // ─── Commandes démo ───
  const demo = generateDemoOrders(Date.now());
  console.log(`🧾 ${demo.length} commandes démo…`);
  await prisma.order.createMany({
    data: demo.map((o) => ({
      id: o.id,
      ref: o.ref,
      userEmail: o.customer.email === DEMO_EMAIL ? DEMO_EMAIL : null,
      mode: o.mode,
      status: o.status,
      zoneIdx: o.zoneIdx,
      slot: o.slot,
      customerName: o.customer.name,
      customerEmail: o.customer.email,
      customerPhone: o.customer.phone,
      address: o.customer.address ?? null,
      city: o.customer.city ?? null,
      zip: o.customer.zip ?? null,
      subtotal: o.subtotal,
      fee: o.fee,
      total: o.total,
      paid: o.paid,
      paymentMethod: o.paymentMethod,
      driver: o.driver ?? null,
      lines: JSON.stringify(o.lines),
      createdAt: new Date(o.createdAt),
    })),
  });

  console.log("✅ Seed terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
