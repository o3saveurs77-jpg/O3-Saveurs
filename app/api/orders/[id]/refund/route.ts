import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound, conflict, serverError } from "@/lib/guard";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { nextCreditNoteNumber } from "@/lib/ref";
import { sendCreditNote } from "@/lib/email";
import { checkRefund, paymentStatusAfterRefund } from "@/lib/refunds";

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
 * Trois effets, dans cet ordre, et l'ordre compte :
 *
 *   1. l'argent part réellement (Stripe pour une carte, rien à faire pour des
 *      espèces rendues en main propre) ;
 *   2. la commande enregistre le montant rendu et reçoit un numéro d'avoir ;
 *   3. l'avoir part par email.
 *
 * Écrire en base avant que Stripe ait accepté afficherait un remboursement qui
 * n'a pas eu lieu. Inversement, un échec d'email ne défait rien : l'argent est
 * parti, la pièce existe, elle reste consultable en ligne.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return notFound("Commande introuvable");

  const body = (await readJson<{ amountCents?: unknown; reason?: unknown }>(req)) ?? {};
  const asked =
    body.amountCents === undefined || body.amountCents === null
      ? null
      : Number(body.amountCents);
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500).trim() : "";

  const check = checkRefund(order, asked);
  if (!check.ok) return conflict(check.error);
  const { amountCents } = check;

  /* Espèces : l'argent est rendu de la main à la main, il n'y a rien à
   * appeler. On enregistre quand même l'avoir — c'est la pièce comptable qui
   * justifie la sortie de caisse, et elle est due au client comme pour une
   * carte. */
  const parCarte = !!order.stripePaymentIntentId;

  if (parCarte) {
    if (!isStripeConfigured()) {
      return serverError("Le remboursement en ligne est indisponible : Stripe n'est pas configuré.");
    }
    try {
      await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId!,
          amount: amountCents,
          metadata: { orderId: order.id, ref: order.ref, reason: reason.slice(0, 100) },
        },
        /* Deux clics sur « Rembourser » ne rendent pas deux fois la somme : la
         * clé porte le montant déjà rendu, donc un remboursement *différent*
         * reste possible ensuite. */
        { idempotencyKey: `refund:${order.id}:${order.refundedCents}:${amountCents}` },
      );
    } catch (error) {
      console.error(`[remboursement] Stripe a refusé pour ${id}:`, error);
      const message =
        error instanceof Error && error.message
          ? `Stripe a refusé le remboursement : ${error.message}`
          : "Stripe a refusé le remboursement.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Le numéro d'avoir n'est attribué qu'une fois : les remboursements partiels
  // successifs viennent compléter la même pièce.
  const creditNoteNumber = order.creditNoteNumber ?? (await nextCreditNoteNumber());

  const updated = await prisma.order.update({
    where: { id },
    data: {
      refundedCents: order.refundedCents + amountCents,
      paymentStatus: paymentStatusAfterRefund(order, amountCents),
      creditNoteNumber,
      refundedAt: new Date(),
      refundReason: reason || order.refundReason,
    },
  });

  const origin = process.env.NEXTAUTH_URL ?? "";
  await sendCreditNote(updated, amountCents, `${origin}/facture/${updated.id}`).catch((error) =>
    console.error(`[remboursement] envoi de l'avoir de ${id} échoué:`, error),
  );

  return NextResponse.json({
    refundedCents: amountCents,
    totalRefundedCents: updated.refundedCents,
    creditNoteNumber,
    channel: parCarte ? ("stripe" as const) : ("especes" as const),
    order: rowToOrder(updated),
  });
}

/** Garde-fou : un GET sur cette route ne doit rien rembourser par accident. */
export function GET() {
  return badRequest("Utilisez POST pour émettre un remboursement.");
}
