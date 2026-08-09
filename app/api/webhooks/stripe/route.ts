import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { releaseStock } from "@/lib/stock";
import { nextInvoiceNumber } from "@/lib/ref";
import { sendPaymentReceived, sendInvoice, sendPaymentFailed } from "@/lib/email";
import type { OrderLine } from "@/lib/types";

export const dynamic = "force-dynamic";
// Le webhook a besoin du corps brut pour vérifier la signature : pas de parsing.

/**
 * POST /api/webhooks/stripe
 *
 * La vérification de signature était déjà correcte ; c'est tout le reste qui
 * manquait. Corrigé ici :
 *
 *  · **Montant** — `amount_total` est comparé au total calculé en base. Sans ce
 *    contrôle, une commande falsifiée était encaissée puis validée sans bruit.
 *  · **Statut réel du paiement** — `checkout.session.completed` peut arriver
 *    avec `payment_status: "unpaid"` (paiements différés) : la commande était
 *    alors marquée payée sans encaissement.
 *  · **Idempotence** — Stripe rejoue en cas de timeout. L'écriture est
 *    conditionnelle et les emails portent une clé d'unicité, donc plus de
 *    doublons de confirmation.
 *  · **Échecs et expirations** — `expired` et `async_payment_failed` libèrent
 *    le stock et annulent la commande, au lieu de laisser des commandes
 *    fantômes « confirmées » mais impayées dans le back-office.
 *  · **Code retour** — une erreur de base renvoie 500 pour que Stripe réessaie.
 *    Répondre 200 signifiait « traité », et la commande restait impayée.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    if (!secret || !signature) throw new Error("Signature ou secret webhook manquant");
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    console.error("[stripe] webhook invalide:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.async_payment_succeeded":
        await onCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.expired":
        await onFailed(event.data.object as Stripe.Checkout.Session, "expire");
        break;

      case "checkout.session.async_payment_failed":
        await onFailed(event.data.object as Stripe.Checkout.Session, "echec");
        break;

      case "charge.refunded":
        await onRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        // Les autres événements ne nous concernent pas : accusé de réception.
        break;
    }
  } catch (error) {
    console.error(`[stripe] traitement de ${event.type} échoué:`, error);
    // 500 volontaire : Stripe réessaiera. Un 200 ici perdrait définitivement le
    // paiement du point de vue de notre base.
    return NextResponse.json({ error: "Traitement échoué" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Paiement acquis ───────────────────────────────────────────

async function onCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.error("[stripe] session sans metadata.orderId:", session.id);
    return; // rien à rattacher : inutile de faire réessayer Stripe
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    console.error(`[stripe] commande ${orderId} introuvable pour la session ${session.id}`);
    return;
  }

  // Idempotence : si la commande est déjà payée, l'événement est un rejeu.
  if (order.paid) return;

  // Le paiement est-il réellement encaissé ? « completed » ne suffit pas.
  if (session.payment_status !== "paid") {
    console.warn(
      `[stripe] session ${session.id} completed mais payment_status=${session.payment_status} — commande ${order.ref} laissée en attente.`,
    );
    return;
  }

  // Le montant encaissé correspond-il à ce que nous avons calculé ?
  if (session.amount_total !== order.totalCents) {
    console.error(
      `[stripe] ÉCART DE MONTANT sur ${order.ref} : encaissé ${session.amount_total}, attendu ${order.totalCents}.`,
    );
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "echec", stripePaymentIntentId: intentId(session) },
    });
    return;
  }

  const invoiceNumber = order.invoiceNumber ?? (await nextInvoiceNumber());

  // Écriture conditionnelle sur `paid: false` : deux webhooks simultanés ne
  // peuvent pas produire deux fois l'effet.
  const applied = await prisma.order.updateMany({
    where: { id: order.id, paid: false },
    data: {
      paid: true,
      paymentStatus: "paye",
      status: order.status === "en_attente_paiement" ? "confirmee" : order.status,
      confirmedAt: order.confirmedAt ?? new Date(),
      stripePaymentIntentId: intentId(session),
      invoiceNumber,
    },
  });
  if (applied.count === 0) return; // un autre appel est passé avant nous

  if (order.promotionId) {
    await prisma.promotion
      .update({ where: { id: order.promotionId }, data: { usedCount: { increment: 1 } } })
      .catch(() => {});
  }

  const fresh = await prisma.order.findUnique({ where: { id: order.id } });
  if (!fresh) return;

  const origin = process.env.NEXTAUTH_URL ?? "";
  await sendPaymentReceived(fresh);
  await sendInvoice(fresh, `${origin}/facture/${fresh.id}`);
}

// ─── Paiement échoué ou session expirée ────────────────────────

async function onFailed(
  session: Stripe.Checkout.Session,
  paymentStatus: "echec" | "expire",
): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paid) return; // déjà payée : ne rien défaire

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus, status: "annulee", canceledAt: new Date() },
  });

  // Le stock réservé à la création est rendu, sinon un panier abandonné
  // immobiliserait des plats indéfiniment.
  await releaseStock(parseLines(order.lines), { orderId: order.id, reason: "correction" });

  /* Le client doit l'apprendre. Sans cet email, sa commande disparaissait en
   * silence : il attendait une livraison qui ne viendrait pas, ou recommandait
   * sans comprendre ce qui s'était passé. */
  const origin = process.env.NEXTAUTH_URL ?? "";
  const fresh = await prisma.order.findUnique({ where: { id: order.id } });
  if (fresh) {
    await sendPaymentFailed(fresh, paymentStatus === "expire", `${origin}/carte`).catch((error) =>
      console.error(`[stripe] email d'échec de paiement pour ${order.id} échoué:`, error),
    );
  }
}

// ─── Remboursement ─────────────────────────────────────────────

async function onRefunded(charge: Stripe.Charge): Promise<void> {
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!intent) return;

  const order = await prisma.order.findFirst({ where: { stripePaymentIntentId: intent } });
  if (!order) return;

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "rembourse" },
  });
}

// ─── Utilitaires ───────────────────────────────────────────────

function intentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string" ? session.payment_intent : null;
}

function parseLines(raw: string): OrderLine[] {
  try {
    return JSON.parse(raw) as OrderLine[];
  } catch {
    return [];
  }
}
