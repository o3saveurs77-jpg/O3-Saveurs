import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToPromotion } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, conflict } from "@/lib/guard";
import {
  describePromotion,
  remainingUses,
  validatePromotionInput,
} from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/**
 * GET /api/promotions — **administration uniquement**.
 *
 * Renvoie chaque promotion accompagnée de ses statistiques réelles :
 *  · `orderCount`   commandes non annulées rattachées via `promotionId` ;
 *  · `revenueCents` chiffre d'affaires généré (somme des `totalCents`).
 *
 * `usedCount` est le compteur incrémenté à la commande ; il peut diverger de
 * `orderCount` lorsqu'une commande est annulée après coup. Les deux sont
 * exposés, l'écran d'administration les libelle distinctement.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const [rows, stats] = await Promise.all([
    prisma.promotion.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    prisma.order.groupBy({
      by: ["promotionId"],
      where: { promotionId: { not: null }, status: { not: "annulee" } },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
  ]);

  const byPromotion = new Map(
    stats.map((s) => [s.promotionId, { orders: s._count._all, revenue: s._sum.totalCents ?? 0 }]),
  );

  const promotions = rows.map((row) => {
    const view = rowToPromotion(row);
    const stat = byPromotion.get(row.id);
    return {
      ...view,
      description: describePromotion(view),
      remainingUses: remainingUses(view),
      orderCount: stat?.orders ?? 0,
      revenueCents: stat?.revenue ?? 0,
    };
  });

  return NextResponse.json({ promotions });
}

/** POST /api/promotions — création, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const input = validatePromotionInput(body);
  if (!input.ok) return badRequest(input.error);

  if (input.value.code) {
    const existing = await prisma.promotion.findUnique({
      where: { code: input.value.code },
      select: { id: true },
    });
    if (existing) return conflict(`Le code ${input.value.code} est déjà utilisé par une autre promotion`);
  }

  try {
    const row = await prisma.promotion.create({ data: input.value });
    return NextResponse.json(rowToPromotion(row), { status: 201 });
  } catch {
    // Course entre deux créations simultanées du même code (contrainte unique).
    return conflict("Ce code promotionnel existe déjà");
  }
}
