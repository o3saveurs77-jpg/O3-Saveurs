import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { optionalUser, canAccess, readJson, notFound, conflict } from "@/lib/guard";
import { releaseStock } from "@/lib/stock";
import { sendStatusUpdate, sendCancelRequest } from "@/lib/email";
import { cancelAbility, refundableCents } from "@/lib/refunds";
import type { OrderLine, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/cancel — annulation à l'initiative du client.
 *
 * Deux issues selon l'avancement, décidées par `lib/refunds.ts` :
 *
 * · commande pas encore engagée en cuisine → elle est annulée immédiatement et
 *   le stock rendu ;
 * · commande déjà en cuisine ou en route → une **demande** est enregistrée.
 *   Elle n'annule rien : des denrées sont sorties et cuisinées, c'est au
 *   restaurant de décider. La demande apparaît dans le back-office.
 *
 * L'argent n'est jamais rendu ici, même sur une annulation immédiate : le
 * remboursement est un geste distinct, déclenché depuis le back-office
 * (`/api/orders/[id]/refund`). Annuler et rembourser dans le même mouvement
 * enlèverait tout contrôle sur les sommes qui sortent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return notFound("Commande introuvable");

  /* Même règle que la lecture d'une commande : son propriétaire, ou un ADMIN.
   * Sans ce contrôle, connaître un identifiant suffirait à annuler la commande
   * de quelqu'un d'autre. */
  const user = await optionalUser();
  if (!canAccess(user, order.customerEmail)) {
    return NextResponse.json({ error: "Commande inaccessible" }, { status: 403 });
  }

  const body = (await readJson<{ reason?: unknown }>(req)) ?? {};
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500).trim() : "";

  const ability = cancelAbility(order.status as OrderStatus);

  if (ability.kind === "none") return conflict(ability.reason);

  // ── Trop tard pour annuler seul : on enregistre la demande ──
  if (ability.kind === "request") {
    if (order.cancelRequestedAt) {
      return conflict("Votre demande d'annulation a déjà été transmise.");
    }
    const updated = await prisma.order.update({
      where: { id },
      data: { cancelRequestedAt: new Date(), cancelReason: reason },
    });

    /* La demande doit atteindre un humain tout de suite : elle n'annule rien
     * par elle-même, et pendant qu'elle attend, les plats cuisent. */
    const origin = process.env.NEXTAUTH_URL ?? "";
    await sendCancelRequest(updated, `${origin}/admin/commandes`).catch((error) =>
      console.error(`[annulation] alerte au restaurant pour ${id} échouée:`, error),
    );

    return NextResponse.json({
      outcome: "requested" as const,
      message:
        "Votre demande est transmise au restaurant. Votre commande étant déjà en préparation, " +
        "elle ne sera annulée qu'après accord de leur part.",
      order: rowToOrder(updated),
    });
  }

  // ── Annulation immédiate ──
  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: "annulee",
      canceledAt: new Date(),
      cancelReason: reason,
      cancelRequestedAt: order.cancelRequestedAt ?? new Date(),
    },
  });

  /* Le stock réservé à la commande est rendu, sinon des plats resteraient
   * immobilisés par une commande qui n'existe plus. */
  await releaseStock(safeLines(order.lines), { orderId: id, reason: "correction" }).catch(
    (error) => console.error(`[annulation] remise en stock de ${id} échouée:`, error),
  );

  await sendStatusUpdate(updated).catch((error) =>
    console.error(`[annulation] email de statut pour ${id} échoué:`, error),
  );

  const aRembourser = refundableCents(updated);

  return NextResponse.json({
    outcome: "canceled" as const,
    message: aRembourser
      ? "Votre commande est annulée. Le remboursement sera traité par le restaurant sous peu."
      : "Votre commande est annulée.",
    refundPendingCents: aRembourser,
    order: rowToOrder(updated),
  });
}

/** Lignes de commande illisibles : on annule quand même, sans rendre de stock. */
function safeLines(raw: string): OrderLine[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrderLine[]) : [];
  } catch {
    return [];
  }
}
