import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rowToUser } from "@/lib/serialize";
import type { MockUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/auth/me — utilisateur courant (ou null)
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json(null);
  const row = await prisma.user.findUnique({ where: { email } });
  return NextResponse.json(row ? { ...rowToUser(row), role: row.role } : null);
}

// PATCH /api/auth/me — met à jour profil / favoris / adresses
export async function PATCH(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = (await req.json()) as Partial<MockUser>;
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.favorites !== undefined) data.favorites = JSON.stringify(body.favorites);
  if (body.addresses !== undefined) data.addresses = JSON.stringify(body.addresses);
  // NB : on ne change pas l'email (identifiant de connexion) ici.

  const row = await prisma.user.update({ where: { email }, data });
  return NextResponse.json(rowToUser(row));
}
