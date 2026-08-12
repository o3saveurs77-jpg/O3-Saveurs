/* Exécution d'un remboursement — l'endroit unique d'où l'argent sort.
 *
 * Les règles (« combien reste-t-il remboursable ? ») vivent dans
 * `lib/refunds.ts`, qui est pur et testable. Ce module-ci fait le geste :
 * appeler Stripe, écrire en base, émettre l'avoir. Il est isolé parce que deux
 * chemins y mènent — le bouton « Rembourser » du back-office, et le refus d'une
 * commande sur commande — et qu'un second exemplaire de ce code finirait par
 * diverger du premier. Sur de l'argent qui part, la divergence est une somme
 * rendue deux fois.
 *
 * L'ordre des trois effets compte, et il est le même qu'avant l'extraction :
 *
 *   1. l'argent part réellement (Stripe pour une carte, rien pour des espèces
 *      rendues en main propre) ;
 *   2. la commande enregistre le montant rendu et reçoit un numéro d'avoir ;
 *   3. l'avoir part par email.
 *
 * Écrire en base avant l'accord de Stripe afficherait un remboursement qui n'a
 * pas eu lieu. Un échec d'email, lui, ne défait rien : l'argent est parti, la
 * pièce existe, elle reste consultable en ligne.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { nextCreditNoteNumber } from "@/lib/ref";
import { sendCreditNote } from "@/lib/email";
import { checkRefund, paymentStatusAfterRefund } from "@/lib/refunds";
import type { Order as OrderRow } from "@prisma/client";

export type RefundOutcome =
  | {
      ok: true;
      amountCents: number;
      totalRefundedCents: number;
      creditNoteNumber: number;
      channel: "stripe" | "especes";
      order: OrderRow;
    }
  | { ok: false; status: number; error: string };

interface RefundOptions {
  /** `null` ou absent = tout ce qui reste remboursable. */
  amountCents?: number | null;
  /** Motif repris sur l'avoir. */
  reason?: string;
}

export async function refundOrder(
  order: OrderRow,
  { amountCents: asked = null, reason = "" }: RefundOptions = {},
): Promise<RefundOutcome> {
  const check = checkRefund(order, asked);
  if (!check.ok) return { ok: false, status: 409, error: check.error };
  const { amountCents } = check;

  /* Espèces : l'argent est rendu de la main à la main, il n'y a rien à
   * appeler. On enregistre quand même l'avoir — c'est la pièce comptable qui
   * justifie la sortie de caisse, et elle est due au client comme pour une
   * carte. */
  const parCarte = !!order.stripePaymentIntentId;

  if (parCarte) {
    if (!isStripeConfigured()) {
      return {
        ok: false,
        status: 500,
        error: "Le remboursement en ligne est indisponible : Stripe n'est pas configuré.",
      };
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
      console.error(`[remboursement] Stripe a refusé pour ${order.id}:`, error);
      return {
        ok: false,
        status: 502,
        error:
          error instanceof Error && error.message
            ? `Stripe a refusé le remboursement : ${error.message}`
            : "Stripe a refusé le remboursement.",
      };
    }
  }

  // Le numéro d'avoir n'est attribué qu'une fois : les remboursements partiels
  // successifs viennent compléter la même pièce.
  const creditNoteNumber = order.creditNoteNumber ?? (await nextCreditNoteNumber());

  const updated = await prisma.order.update({
    where: { id: order.id },
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
    console.error(`[remboursement] envoi de l'avoir de ${order.id} échoué:`, error),
  );

  return {
    ok: true,
    amountCents,
    totalRefundedCents: updated.refundedCents,
    creditNoteNumber,
    channel: parCarte ? "stripe" : "especes",
    order: updated,
  };
}
