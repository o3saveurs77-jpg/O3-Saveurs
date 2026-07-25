import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToZone } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// GET /api/zones — zones ordonnées
export async function GET() {
  const rows = await prisma.zone.findMany({ orderBy: { idx: "asc" } });
  return NextResponse.json(rows.map(rowToZone));
}

// PUT /api/zones — met à jour une zone par index { idx, fee, min, villes }
export async function PUT(req: Request) {
  const body = (await req.json()) as { idx: number; fee?: number; min?: number; villes?: string[] };
  if (typeof body.idx !== "number") {
    return NextResponse.json({ error: "idx requis" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.fee !== undefined) data.fee = body.fee;
  if (body.min !== undefined) data.minimum = body.min;
  if (body.villes !== undefined) data.cities = JSON.stringify(body.villes);
  const row = await prisma.zone.update({ where: { idx: body.idx }, data });
  return NextResponse.json(rowToZone(row));
}
