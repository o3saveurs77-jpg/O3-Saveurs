/* Génération de commandes de démo pour le back-office (mock) */

import { items, zones } from "./menu";
import type { Order, OrderStatus, OrderMode, CartLine } from "./types";

const FIRST = ["Awa", "Karim", "Léa", "Yacine", "Sophie", "Moussa", "Inès", "Thomas", "Fatou", "Hugo", "Nadia", "Lucas"];
const LAST = ["Diallo", "Benali", "Martin", "Traoré", "Nguyen", "Lefèvre", "Sow", "Garcia", "Bernard", "Cissé"];
const DRIVERS = ["Samir", "Kevin", "Dramane", "Élodie"];

// PRNG déterministe (mulberry32) pour des données stables
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ref = (r: () => number) =>
  "#" + Array.from({ length: 4 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(r() * 31)]).join("");

const sellable = items.filter((i) => i.price != null);

export function generateDemoOrders(now: number, count = 64): Order[] {
  const r = rng(20260607);
  const out: Order[] = [];

  for (let i = 0; i < count; i++) {
    // réparti sur les 30 derniers jours, plus dense récemment
    const daysAgo = Math.floor(Math.pow(r(), 1.4) * 30);
    const created = now - daysAgo * 86400000 - Math.floor(r() * 86400000);

    const nLines = 1 + Math.floor(r() * 3);
    const lines: CartLine[] = [];
    for (let j = 0; j < nLines; j++) {
      const d = sellable[Math.floor(r() * sellable.length)];
      const qty = 1 + Math.floor(r() * 2);
      lines.push({
        key: d.id + "|" + j,
        dishId: d.id,
        name: d.name,
        photo: d.photo,
        unitPrice: d.price!,
        qty,
        opts: {},
        formule: null,
        note: "",
      });
    }

    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const mode: OrderMode = r() > 0.35 ? "livraison" : "emporter";
    const zoneIdx = mode === "livraison" ? Math.floor(r() * zones.length) : null;
    const fee = zoneIdx != null ? zones[zoneIdx].fee : 0;

    // statut : commandes anciennes = livrées, récentes = en cours
    let status: OrderStatus;
    if (daysAgo === 0) {
      status = (["confirmee", "cuisine", "route", "livree"] as OrderStatus[])[Math.floor(r() * 4)];
    } else if (daysAgo === 1 && r() > 0.7) {
      status = "route";
    } else {
      status = r() > 0.06 ? "livree" : "annulee";
    }

    const first = FIRST[Math.floor(r() * FIRST.length)];
    const last = LAST[Math.floor(r() * LAST.length)];

    out.push({
      id: "ord_" + i + "_" + Math.floor(created),
      ref: ref(r),
      lines,
      mode,
      zoneIdx,
      slot: r() > 0.5 ? "asap" : "19:30",
      customer: {
        name: `${first} ${last}`,
        email: `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@email.com",
        phone: "06 " + Math.floor(10 + r() * 89) + " " + Math.floor(10 + r() * 89) + " " + Math.floor(10 + r() * 89) + " " + Math.floor(10 + r() * 89),
        city: zoneIdx != null ? zones[zoneIdx].villes[0] : undefined,
      },
      subtotal,
      fee,
      total: subtotal + fee,
      status,
      paid: status !== "annulee",
      paymentMethod: r() > 0.3 ? "Carte" : r() > 0.5 ? "Apple Pay" : "Google Pay",
      createdAt: created,
      driver: mode === "livraison" && status !== "confirmee" ? DRIVERS[Math.floor(r() * DRIVERS.length)] : null,
    });
  }

  // commandes personnelles du client démo (pour peupler l'espace client)
  out.push(...demoUserOrders(now, r));

  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** email du compte démo (cf. AuthContext) */
export const DEMO_EMAIL = "awa.diallo@email.com";
const DEMO_NAME = "Awa Diallo";

function demoUserOrders(now: number, r: () => number): Order[] {
  const specs: { daysAgo: number; status: OrderStatus; mode: OrderMode }[] = [
    { daysAgo: 0, status: "route", mode: "livraison" },
    { daysAgo: 3, status: "livree", mode: "livraison" },
    { daysAgo: 9, status: "livree", mode: "emporter" },
    { daysAgo: 18, status: "livree", mode: "livraison" },
    { daysAgo: 27, status: "livree", mode: "emporter" },
  ];

  return specs.map((s, i) => {
    const created = now - s.daysAgo * 86400000 - Math.floor(r() * 40000000);
    const nLines = 1 + Math.floor(r() * 3);
    const lines: CartLine[] = [];
    for (let j = 0; j < nLines; j++) {
      const d = sellable[Math.floor(r() * sellable.length)];
      const qty = 1 + Math.floor(r() * 2);
      lines.push({
        key: d.id + "|u" + j,
        dishId: d.id,
        name: d.name,
        photo: d.photo,
        unitPrice: d.price!,
        qty,
        opts: {},
        formule: null,
        note: "",
      });
    }
    const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
    const zoneIdx = s.mode === "livraison" ? 0 : null;
    const fee = zoneIdx != null ? zones[zoneIdx].fee : 0;
    return {
      id: "ord_user_" + i,
      ref: ref(r),
      lines,
      mode: s.mode,
      zoneIdx,
      slot: r() > 0.5 ? "asap" : "20:00",
      customer: {
        name: DEMO_NAME,
        email: DEMO_EMAIL,
        phone: "06 12 34 56 78",
        address: s.mode === "livraison" ? "12 rue des Acacias" : undefined,
        city: s.mode === "livraison" ? "Lognes" : undefined,
        zip: s.mode === "livraison" ? "77185" : undefined,
      },
      subtotal,
      fee,
      total: subtotal + fee,
      status: s.status,
      paid: true,
      paymentMethod: "Carte",
      createdAt: created,
      driver: s.mode === "livraison" && s.status !== "confirmee" ? DRIVERS[i % DRIVERS.length] : null,
    };
  });
}

export { DRIVERS };
