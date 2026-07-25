import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDish, dishToRow } from "@/lib/serialize";
import type { Dish } from "@/lib/menu";

export const dynamic = "force-dynamic";

// GET /api/dishes — tout le catalogue
export async function GET() {
  const rows = await prisma.dish.findMany({ orderBy: { position: "asc" } });
  return NextResponse.json(rows.map(rowToDish));
}

// POST /api/dishes — créer un plat
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Dish>;
  if (!body.name || !body.cat) {
    return NextResponse.json({ error: "name et cat requis" }, { status: 400 });
  }
  const count = await prisma.dish.count();
  const row = await prisma.dish.create({
    data: {
      ...dishToRow(body),
      cat: body.cat,
      name: body.name,
      position: count,
    } as never,
  });
  return NextResponse.json(rowToDish(row), { status: 201 });
}
