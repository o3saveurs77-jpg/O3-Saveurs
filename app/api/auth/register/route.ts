import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rowToUser } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// POST /api/auth/register { name, email, password, phone? }
// Crée un compte client. Le login se fait ensuite via NextAuth (signIn credentials).
export async function POST(req: Request) {
  const { name, email, password, phone } = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  };

  const mail = (email ?? "").trim().toLowerCase();
  if (!mail || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Email et mot de passe (6 caractères min.) requis." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: mail } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 10);
  const row = await prisma.user.create({
    data: {
      email: mail,
      name: name?.trim() || mail.split("@")[0],
      phone: phone ?? "",
      password: hash,
      role: "CLIENT",
      favorites: "[]",
      addresses: "[]",
    },
  });

  return NextResponse.json(rowToUser(row), { status: 201 });
}
