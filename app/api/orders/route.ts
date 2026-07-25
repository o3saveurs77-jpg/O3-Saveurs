import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { makeRef } from "@/lib/ref";
import { sendOrderConfirmation } from "@/lib/email";
import type { CartLine, OrderCustomer, OrderMode } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/orders  (?email=… pour filtrer un client)
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email");
  const rows = await prisma.order.findMany({
    where: email ? { customerEmail: email } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map(rowToOrder));
}

interface CreateBody {
  lines: CartLine[];
  mode: OrderMode;
  zoneIdx: number | null;
  slot: string;
  customer: OrderCustomer;
  subtotal: number;
  fee: number;
  paymentMethod: string;
}

// POST /api/orders — créer une commande sans paiement en ligne
// (« Espèces sur place »). Les paiements carte passent par /api/checkout.
export async function POST(req: Request) {
  const b = (await req.json()) as CreateBody;
  if (!b.lines?.length || !b.customer?.name) {
    return NextResponse.json({ error: "Panier ou client manquant" }, { status: 400 });
  }
  const session = await auth();
  const total = b.subtotal + b.fee;

  const row = await prisma.order.create({
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
      paid: false, // réglé à la livraison / au retrait
      paymentMethod: b.paymentMethod,
      lines: JSON.stringify(b.lines),
    },
  });

  // Email de confirmation client + notification restaurant (si Resend configuré).
  await sendOrderConfirmation(row);

  return NextResponse.json(rowToOrder(row), { status: 201 });
}
