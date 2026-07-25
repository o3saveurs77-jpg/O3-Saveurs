/* Agrégations pour le tableau de bord admin (calculées depuis les commandes mock) */

import type { Order } from "./types";

const DAY = 86400000;

export interface DayPoint {
  day: string; // "12/06"
  ts: number;
  ca: number;
  commandes: number;
}

/** Commandes valides (non annulées) */
export const valid = (orders: Order[]) => orders.filter((o) => o.status !== "annulee");

/** Chiffre d'affaires & nombre de commandes par jour sur N jours glissants */
export function revenueByDay(orders: Order[], now: number, days = 14): DayPoint[] {
  const out: DayPoint[] = [];
  const v = valid(orders);
  for (let i = days - 1; i >= 0; i--) {
    const start = startOfDay(now - i * DAY);
    const end = start + DAY;
    const inDay = v.filter((o) => o.createdAt >= start && o.createdAt < end);
    out.push({
      day: new Date(start).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      ts: start,
      ca: round(inDay.reduce((s, o) => s + o.total, 0)),
      commandes: inDay.length,
    });
  }
  return out;
}

export function ordersByStatus(orders: Order[]) {
  const counts: Record<string, number> = {};
  orders.forEach((o) => (counts[o.status] = (counts[o.status] ?? 0) + 1));
  return counts;
}

export function topDishes(orders: Order[], limit = 6) {
  const map = new Map<string, { name: string; qty: number; ca: number }>();
  valid(orders).forEach((o) =>
    o.lines.forEach((l) => {
      const e = map.get(l.name) ?? { name: l.name, qty: 0, ca: 0 };
      e.qty += l.qty;
      e.ca += l.unitPrice * l.qty;
      map.set(l.name, e);
    })
  );
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function kpis(orders: Order[], now: number) {
  const v = valid(orders);
  const ca = v.reduce((s, o) => s + o.total, 0);
  const avg = v.length ? ca / v.length : 0;
  const delivered = v.filter((o) => o.status === "livree").length;
  const deliveryRate = v.length ? (delivered / v.length) * 100 : 0;

  const today = startOfDay(now);
  const caToday = v.filter((o) => o.createdAt >= today).reduce((s, o) => s + o.total, 0);
  const ordersToday = v.filter((o) => o.createdAt >= today).length;

  // semaine en cours vs précédente
  const weekStart = today - 6 * DAY;
  const prevWeekStart = weekStart - 7 * DAY;
  const caWeek = v.filter((o) => o.createdAt >= weekStart).reduce((s, o) => s + o.total, 0);
  const caPrevWeek = v
    .filter((o) => o.createdAt >= prevWeekStart && o.createdAt < weekStart)
    .reduce((s, o) => s + o.total, 0);
  const weekTrend = caPrevWeek ? ((caWeek - caPrevWeek) / caPrevWeek) * 100 : 0;

  return {
    ca: round(ca),
    avg: round(avg),
    deliveryRate: Math.round(deliveryRate),
    total: v.length,
    caToday: round(caToday),
    ordersToday,
    caWeek: round(caWeek),
    weekTrend: Math.round(weekTrend),
  };
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const round = (n: number) => Math.round(n * 100) / 100;
