import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound, conflict } from "@/lib/guard";
import { releaseStock } from "@/lib/stock";
import { refundOrder } from "@/lib/refundOrder";
import { sendPreorderAccepted, sendPreorderRefused } from "@/lib/email";
import type { OrderLine } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  decision: "accepter" | "refuser";
  /** Explication reprise dans l'email au client et sur l'avoir. */
  reason?: string;
}

/**
 * POST /api/orders/[id]/preorder — accepte ou refuse une commande sur commande.
 * **Administration uniquement.**
 *
 * C'est le droit de regard que la cliente s'est réservé : un gigot ou un
 * agneau entier engagent un achat chez le boucher, et une date peut tomber un
 * jour où la cuisine est déjà pleine. Tant que la décision n'est pas prise, la
 * commande est payée mais n'entre pas en cuisine.
 *
 * Une route dédiée plutôt qu'un `PATCH status` : refuser n'est pas « passer en
 * annulée », c'est un enchaînement qui doit tenir d'un bloc — rendre l'argent,
 * remettre le stock, expliquer au client, émettre l'avoir. Laisser le
 * back-office enchaîner deux appels ferait qu'un réseau qui lâche entre les
 * deux produirait une commande annulée jamais remboursée.
 *
 * Le remboursement passe **avant** l'annulation : si Stripe refuse, la commande
 * reste « à valider » et la cliente peut réessayer. L'inverse laisserait une
 * commande morte avec l'argent du client dessus.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  if (body.decision !== "accepter" && body.decision !== "refuser") {
    return badRequest("Décision attendue : « accepter » ou « refuser ».");
  }
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500).trim() : "";

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return notFound("Commande introuvable");

  if (!order.preorder) {
    return conflict("Cette commande n'est pas une commande sur commande.");
  }
  if (order.status !== "en_attente_validation") {
    return conflict(
      order.status === "annulee"
        ? "Cette commande est déjà annulée."
        : "Cette commande a déjà été validée.",
    );
  }

  // ── Accord : la commande devient ferme et rejoint le flux normal ──
  if (body.decision === "accepter") {
    const updated = await prisma.order.update({
      where: { id },
      data: { status: "confirmee", confirmedAt: new Date() },
      include: { driver: { select: { name: true } } },
    });

    await sendPreorderAccepted(updated).catch((error) =>
      console.error(`[precommande] email d'acceptation de ${id} échoué:`, error),
    );

    return NextResponse.json({ outcome: "acceptee" as const, order: rowToOrder(updated) });
  }

  // ── Refus : l'argent revient d'abord ──
  let refundedCents = 0;
  if (order.paid) {
    const refunded = await refundOrder(order, {
      reason: reason || "Commande sur commande refusée par le restaurant",
    });
    if (!refunded.ok) {
      return NextResponse.json(
        {
          error: `${refunded.error} La commande reste à valider : rien n'a été annulé.`,
        },
        { status: refunded.status },
      );
    }
    refundedCents = refunded.amountCents;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: "annulee",
      canceledAt: new Date(),
      refusalReason: reason,
    },
    include: { driver: { select: { name: true } } },
  });

  /* Le stock réservé à la commande est rendu. Les plats sur commande sont le
   * plus souvent à stock illimité, mais un accompagnement du panier, lui, ne
   * l'est pas — et il resterait immobilisé par une commande qui n'existe plus. */
  await releaseStock(safeLines(order.lines), { orderId: id, reason: "correction" }).catch(
    (error) => console.error(`[precommande] remise en stock de ${id} échouée:`, error),
  );

  /* Cet email part **en plus** de l'avoir : l'avoir est une pièce comptable,
   * il n'explique pas pourquoi la commande n'aura pas lieu. Sans ce message, le
   * client voit revenir de l'argent sans savoir ce qui s'est passé, et se
   * présente quand même le jour dit. */
  await sendPreorderRefused(updated, reason).catch((error) =>
    console.error(`[precommande] email de refus de ${id} échoué:`, error),
  );

  return NextResponse.json({
    outcome: "refusee" as const,
    refundedCents,
    order: rowToOrder(updated),
  });
}

/** Lignes illisibles : on refuse quand même, sans rendre de stock. */
function safeLines(raw: string): OrderLine[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrderLine[]) : [];
  } catch {
    return [];
  }
}
