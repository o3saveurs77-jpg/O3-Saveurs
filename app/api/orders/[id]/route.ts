import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: OrderStatus[] = ["confirmee", "cuisine", "route", "livree", "annulee"];

// GET /api/orders/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.order.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  return NextResponse.json(rowToOrder(row));
}

// PATCH /api/orders/[id] — changer statut et/ou livreur
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { status?: OrderStatus; driver?: string | null };
  const data: Record<string, unknown> = {};
  if (body.status) {
    if (!VALID.includes(body.status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.driver !== undefined) data.driver = body.driver;

  try {
    const row = await prisma.order.update({ where: { id }, data });
    return NextResponse.json(rowToOrder(row));
  } catch {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }
}
