/* État et mouvements de stock.
 *
 * Réservé à l'administration : le stock restant d'un plat est une donnée
 * d'exploitation, pas une information publique. Le client apprend seulement,
 * via `available`, qu'un plat n'est plus commandable.
 *
 * Toute la logique métier (décrément conditionnel, remise en vente automatique,
 * trace dans `StockMovement`) vit dans `lib/stock.ts` — cette route ne fait que
 * valider les entrées et déléguer.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound, serverError } from "@/lib/guard";
import { collect, str, int, oneOf } from "@/lib/validate";
import { applyMovement, lowStockDishes } from "@/lib/stock";
import { STOCK_REASONS } from "@/lib/types";

export const dynamic = "force-dynamic";

const MOVEMENTS_PAGE = 60;
const MOVEMENTS_MAX = 300;

/** Bornes volontairement étroites : un stock de restaurant se compte en portions. */
const MAX_DELTA = 10_000;

interface MovementBody {
  dishId?: unknown;
  delta?: unknown;
  reason?: unknown;
  note?: unknown;
  absolute?: unknown;
}

/**
 * GET /api/stock — état des stocks, **administration uniquement**.
 *
 * Renvoie d'un seul coup ce dont l'écran Stocks a besoin : la liste complète
 * des plats avec leur stock, les plats sous leur seuil d'alerte, et les derniers
 * mouvements. Trois appels séparés donneraient trois instantanés incohérents.
 *
 * Filtres facultatifs sur l'historique : `?dishId=`, `?reason=`, `?take=`,
 * `?skip=`.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = new URL(req.url).searchParams;
  const take = Math.min(MOVEMENTS_MAX, Math.max(1, Number(params.get("take")) || MOVEMENTS_PAGE));
  const skip = Math.max(0, Number(params.get("skip")) || 0);

  const dishId = params.get("dishId");
  const reason = params.get("reason");
  const where = {
    ...(dishId ? { dishId } : {}),
    ...(reason && (STOCK_REASONS as readonly string[]).includes(reason) ? { reason } : {}),
  };

  const [dishes, lowStock, movements, movementsTotal] = await Promise.all([
    prisma.dish.findMany({
      orderBy: [{ cat: "asc" }, { position: "asc" }],
      select: {
        id: true,
        cat: true,
        name: true,
        stock: true,
        stockAlert: true,
        available: true,
        priceCents: true,
        costCents: true,
      },
    }),
    lowStockDishes(),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { dish: { select: { name: true } } },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return NextResponse.json({
    dishes,
    lowStock,
    movements: movements.map((m) => ({
      id: m.id,
      dishId: m.dishId,
      dishName: m.dish.name,
      delta: m.delta,
      reason: m.reason,
      note: m.note,
      author: m.author,
      orderId: m.orderId,
      createdAt: m.createdAt.getTime(),
    })),
    movementsTotal,
    take,
    skip,
  });
}

/**
 * POST /api/stock — applique un mouvement, **administration uniquement**.
 *
 * Corps : `{ dishId, delta, reason, note?, absolute? }`.
 * `absolute` n'est lu que pour un `inventaire` : c'est le stock **constaté** en
 * cuisine, et `applyMovement` en déduit l'écart à enregistrer.
 *
 * Un mouvement sortant (`delta < 0`) ou une perte exige une note : c'est tout
 * l'intérêt du journal de pouvoir répondre à « où sont passées les 12 parts de
 * mafé ? ». Les ventes, elles, sont tracées automatiquement par la commande.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<MovementBody>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    dishId: str(body.dishId, "Le plat", { min: 1, max: 60 }),
    reason: oneOf(body.reason, STOCK_REASONS, "Le motif"),
    // `?? 0` : sans cela un `delta` absent vaudrait la borne minimale.
    delta: int(body.delta ?? 0, "La quantité", { min: -MAX_DELTA, max: MAX_DELTA }),
    note: str(body.note, "La note", { max: 300, required: false }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const { dishId, reason, delta, note } = fields.value;

  let absolute: number | undefined;
  if (reason === "inventaire") {
    if (body.absolute === undefined || body.absolute === null || body.absolute === "") {
      return badRequest("Un inventaire demande le stock constaté");
    }
    const v = int(body.absolute, "Le stock constaté", { min: 0, max: MAX_DELTA });
    if (!v.ok) return badRequest(v.error);
    absolute = v.value;
  }

  if ((delta < 0 || reason === "perte") && !note) {
    return badRequest("Une sortie ou une perte demande une explication");
  }

  if (reason !== "inventaire" && delta === 0) {
    return badRequest("La quantité ne peut pas être nulle");
  }

  const exists = await prisma.dish.findUnique({ where: { id: dishId }, select: { id: true } });
  if (!exists) return notFound("Plat introuvable");

  try {
    await applyMovement({
      dishId,
      delta,
      reason,
      note: note || null,
      author: guard.user.email,
      absolute,
    });
  } catch (error) {
    console.error("Mouvement de stock refusé:", error);
    return serverError("Le mouvement n'a pas pu être enregistré");
  }

  // L'état renvoyé est relu après le mouvement : `applyMovement` peut avoir
  // remis le plat en vente (stock repassé au-dessus de zéro), l'écran doit le
  // refléter sans second appel.
  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    select: { id: true, name: true, stock: true, stockAlert: true, available: true },
  });

  return NextResponse.json({ ok: true, dish }, { status: 201 });
}
