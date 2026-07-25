import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendOrderConfirmation } from "@/lib/email";

export const dynamic = "force-dynamic";
// Le webhook a besoin du corps brut (signature) — pas de parsing/cache.

// POST /api/webhooks/stripe — confirme le paiement et envoie l'email.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    if (!secret || !sig) throw new Error("Signature ou secret webhook manquant");
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("Webhook Stripe invalide:", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const cs = event.data.object as Stripe.Checkout.Session;
    const orderId = cs.metadata?.orderId;
    if (orderId) {
      try {
        const order = await prisma.order.update({
          where: { id: orderId },
          data: { paid: true },
        });
        await sendOrderConfirmation(order);
      } catch (err) {
        console.error(`Maj commande ${orderId} depuis webhook échouée:`, err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
