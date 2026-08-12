import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { refundOrder } from "@/lib/refundOrder";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/refund — rembourse tout ou partie d'une commande.
 * **Administration uniquement.**
 *
 * Le corps ne porte qu'un montant *facultatif* et un motif : le serveur relit
 * le total et ce qui a déjà été rendu, puis calcule lui-même ce qu'il reste
 * remboursable (`lib/refunds.ts`). Comme pour la commande, aucun montant venu
 * du navigateur ne fait autorité — sinon un appel forgé rendrait 500 € sur une
 * commande de 20 €.
 *
 * Le geste lui-même — Stripe, écriture, avoir — vit dans `lib/refundOrder.ts`,
 * partagé avec le refus d'une commande sur commande.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return notFound("Commande introuvable");

  const body = (await readJson<{ amountCents?: unknown; reason?: unknown }>(req)) ?? {};
  const asked =
    body.amountCents === undefined || body.amountCents === null ? null : Number(body.amountCents);
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500).trim() : "";

  const done = await refundOrder(order, { amountCents: asked, reason });
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });

  return NextResponse.json({
    refundedCents: done.amountCents,
    totalRefundedCents: done.totalRefundedCents,
    creditNoteNumber: done.creditNoteNumber,
    channel: done.channel,
    order: rowToOrder(done.order),
  });
}

/** Garde-fou : un GET sur cette route ne doit rien rembourser par accident. */
export function GET() {
  return badRequest("Utilisez POST pour émettre un remboursement.");
}
