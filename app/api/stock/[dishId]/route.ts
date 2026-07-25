/* Historique des mouvements d'un plat.
 *
 * Séparé de `GET /api/stock` (qui renvoie l'état global) : ici on remonte tout
 * le passé d'un seul plat, page par page. Sans pagination, un plat vendu tous
 * les jours pendant un an renverrait des milliers de lignes à chaque ouverture
 * de la fiche.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, notFound } from "@/lib/guard";
import { STOCK_REASONS } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/stock/[dishId] — journal du plat, **administration uniquement**.
 * `?take=` / `?skip=` pour la pagination, `?reason=` pour filtrer par motif.
 */
export async function GET(req: Request, { params }: { params: Promise<{ dishId: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { dishId } = await params;

  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    select: { id: true, name: true, stock: true, stockAlert: true, available: true },
  });
  if (!dish) return notFound("Plat introuvable");

  const sp = new URL(req.url).searchParams;
  const take = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("take")) || PAGE_SIZE));
  const skip = Math.max(0, Number(sp.get("skip")) || 0);

  const reason = sp.get("reason");
  const where = {
    dishId,
    ...(reason && (STOCK_REASONS as readonly string[]).includes(reason) ? { reason } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.stockMovement.count({ where }),
  ]);

  return NextResponse.json({
    dish,
    movements: rows.map((m) => ({
      id: m.id,
      dishId: m.dishId,
      dishName: dish.name,
      delta: m.delta,
      reason: m.reason,
      note: m.note,
      author: m.author,
      orderId: m.orderId,
      createdAt: m.createdAt.getTime(),
    })),
    total,
    take,
    skip,
  });
}
