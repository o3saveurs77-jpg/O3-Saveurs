import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDish, dishToRow } from "@/lib/serialize";
import type { Dish } from "@/lib/menu";

export const dynamic = "force-dynamic";

// PATCH /api/dishes/[id] — mise à jour partielle
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Partial<Dish>;
  try {
    const row = await prisma.dish.update({ where: { id }, data: dishToRow(body) as never });
    return NextResponse.json(rowToDish(row));
  } catch {
    return NextResponse.json({ error: "Plat introuvable" }, { status: 404 });
  }
}

// DELETE /api/dishes/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.dish.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Plat introuvable" }, { status: 404 });
  }
}
