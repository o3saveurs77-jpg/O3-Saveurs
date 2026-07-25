/* GET /api/stats — agrégation du tableau de bord, **côté serveur**.
 *
 * Les KPIs étaient calculés dans le navigateur à partir de la liste complète des
 * commandes (AUDIT §4.6) : le chiffre d'affaires affiché dépendait du fuseau
 * horaire de la machine consultée, et les tranches journalières se décalaient
 * aux changements d'heure. Tout est désormais calculé ici, en `Europe/Paris`,
 * et l'écran ne fait plus qu'afficher.
 *
 * Réservé aux ADMIN : la réponse agrège l'intégralité du chiffre d'affaires et
 * nomme des clients.
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { rowToOrder } from "@/lib/serialize";
import { lowStockDishes } from "@/lib/stock";
import type { Order, OrderStatus } from "@/lib/types";
import {
  ABANDONED_AFTER_MINUTES,
  LATE_AFTER_MINUTES,
  comparePeriod,
  elapsedMinutes,
  estimatedMargin,
  inRange,
  modeSplit,
  ordersByStatus,
  parisPeriodBounds,
  parisShiftDays,
  peakHours,
  revenueByDay,
  stageDelays,
  topDishes,
  zoneSplit,
  type AlertOrder,
  type StatsResponse,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 92;
/** Nombre de commandes détaillées par alerte : au-delà, seul le total compte. */
const ALERT_SAMPLE = 12;

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const now = new Date();
  const nowMs = now.getTime();
  const days = readDays(req);

  const bounds = parisPeriodBounds(now);
  const seriesStart = parisShiftDays(now, -(days - 1)).getTime();
  // Fenêtre de lecture : la plus ancienne borne utile (le mois précédent sert de
  // référence de comparaison, la série peut aller plus loin en arrière).
  const windowStart = Math.min(seriesStart, bounds.month.prevStart);

  const lateCut = new Date(nowMs - LATE_AFTER_MINUTES * 60_000);
  const abandonedCut = new Date(nowMs - ABANDONED_AFTER_MINUTES * 60_000);

  const lateWhere: Prisma.OrderWhereInput = {
    status: { in: ["confirmee", "cuisine", "route"] },
    // Une commande confirmée sans horodatage (import, seed) est datée par sa
    // création : sans ce repli elle n'apparaîtrait jamais en retard.
    OR: [{ confirmedAt: { lte: lateCut } }, { confirmedAt: null, createdAt: { lte: lateCut } }],
  };
  const unpaidWhere: Prisma.OrderWhereInput = {
    paid: false,
    // Ni les annulées, ni les paniers jamais payés : ce sont des commandes
    // acceptées dont l'argent n'est pas rentré (espèces, virement en attente).
    status: { notIn: ["annulee", "en_attente_paiement"] },
  };
  const abandonedWhere: Prisma.OrderWhereInput = {
    status: "en_attente_paiement",
    createdAt: { lte: abandonedCut },
  };

  const [rows, dishes, lowStock, unpaid, late, abandoned] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: new Date(windowStart) } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dish.findMany({ select: { id: true, costCents: true } }),
    lowStockDishes(),
    alertBucket(unpaidWhere, nowMs),
    alertBucket(lateWhere, nowMs),
    alertBucket(abandonedWhere, nowMs),
  ]);

  const orders: Order[] = rows.map((r) => rowToOrder(r));
  // Répartitions et délais portent sur la fenêtre affichée, pas sur tout
  // l'historique : « heures de pointe depuis l'ouverture » n'aide personne.
  const windowOrders = inRange(orders, seriesStart, nowMs + 1);
  const costByDish = new Map(dishes.map((d) => [d.id, d.costCents]));

  const payload: StatsResponse = {
    generatedAt: nowMs,
    days,
    periods: {
      day: comparePeriod(orders, "Aujourd'hui", "hier", bounds.day),
      week: comparePeriod(orders, "Cette semaine", "semaine précédente", bounds.week),
      month: comparePeriod(orders, "Ce mois-ci", "mois précédent", bounds.month),
    },
    series: revenueByDay(orders, now, days),
    byStatus: ordersByStatus(windowOrders),
    modes: modeSplit(windowOrders),
    zones: zoneSplit(windowOrders),
    hours: peakHours(windowOrders),
    topDishes: topDishes(windowOrders, 8),
    margin: estimatedMargin(windowOrders, costByDish),
    delays: stageDelays(windowOrders),
    alerts: { lowStock, unpaid, late, abandoned },
  };

  return NextResponse.json(payload);
}

function readDays(req: Request): number {
  const raw = Number(new URL(req.url).searchParams.get("days"));
  if (!Number.isFinite(raw)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.round(raw)));
}

/**
 * Compte, montant total et échantillon d'une alerte.
 * Le compte et la somme viennent de la base (`aggregate`) : ils restent justes
 * même quand l'échantillon est tronqué.
 */
async function alertBucket(
  where: Prisma.OrderWhereInput,
  nowMs: number,
): Promise<{ count: number; totalCents: number; orders: AlertOrder[] }> {
  const [agg, rows] = await Promise.all([
    prisma.order.aggregate({ where, _count: { _all: true }, _sum: { totalCents: true } }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: ALERT_SAMPLE,
      select: {
        id: true,
        ref: true,
        customerName: true,
        totalCents: true,
        status: true,
        createdAt: true,
        confirmedAt: true,
      },
    }),
  ]);

  return {
    count: agg._count._all,
    totalCents: agg._sum.totalCents ?? 0,
    orders: rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      customerName: r.customerName,
      totalCents: r.totalCents,
      status: r.status as OrderStatus,
      createdAt: r.createdAt.getTime(),
      minutes: elapsedMinutes(
        {
          createdAt: r.createdAt.getTime(),
          timeline: { confirmedAt: r.confirmedAt ? r.confirmedAt.getTime() : null },
        },
        nowMs,
      ),
    })),
  };
}
