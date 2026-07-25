import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { makeRef } from "@/lib/ref";
import type { CartLine, OrderCustomer, OrderMode } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  lines: CartLine[];
  mode: OrderMode;
  zoneIdx: number | null;
  slot: string;
  customer: OrderCustomer;
  subtotal: number;
  fee: number;
  paymentMethod: string;
}

// POST /api/checkout — crée une commande (paid=false) puis une session
// Stripe Checkout. Renvoie { url } vers laquelle rediriger le client.
export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b.lines?.length || !b.customer?.name) {
    return NextResponse.json({ error: "Panier ou client manquant" }, { status: 400 });
  }

  const session = await auth();
  const total = b.subtotal + b.fee;

  const order = await prisma.order.create({
    data: {
      ref: makeRef(),
      userEmail: session?.user?.email ?? null,
      mode: b.mode,
      status: "confirmee",
      zoneIdx: b.zoneIdx,
      slot: b.slot,
      customerName: b.customer.name,
      customerEmail: b.customer.email,
      customerPhone: b.customer.phone,
      address: b.customer.address ?? null,
      city: b.customer.city ?? null,
      zip: b.customer.zip ?? null,
      subtotal: b.subtotal,
      fee: b.fee,
      total,
      paid: false,
      paymentMethod: b.paymentMethod,
      lines: JSON.stringify(b.lines),
    },
  });

  const origin = req.headers.get("origin") || process.env.NEXTAUTH_URL || new URL(req.url).origin;

  // Stripe non configuré (dev sans clés) : on renvoie directement le suivi
  // en marquant la commande payée, pour ne pas bloquer les tests locaux.
  if (!isStripeConfigured()) {
    await prisma.order.update({ where: { id: order.id }, data: { paid: true } });
    return NextResponse.json({ url: `${origin}/commande/${order.id}?paid=1`, mock: true });
  }

  const line_items = b.lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency: "eur",
      unit_amount: Math.round(l.unitPrice * 100),
      product_data: {
        name: l.name,
        description: l.formule || Object.values(l.opts).join(", ") || undefined,
      },
    },
  }));

  if (b.fee > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: Math.round(b.fee * 100),
        product_data: { name: "Frais de livraison", description: undefined },
      },
    });
  }

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: b.customer.email || undefined,
      success_url: `${origin}/commande/${order.id}?paid=1`,
      cancel_url: `${origin}/commander?canceled=1`,
      metadata: { orderId: order.id, ref: order.ref },
      locale: "fr",
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: checkout.id },
    });

    return NextResponse.json({ url: checkout.url, orderId: order.id });
  } catch (err) {
    console.error("Stripe checkout échoué:", err);
    // On nettoie la commande orpheline pour ne pas polluer le back-office.
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    return NextResponse.json({ error: "Paiement indisponible, réessayez." }, { status: 502 });
  }
}
