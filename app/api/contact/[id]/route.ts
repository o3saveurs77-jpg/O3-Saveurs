import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { rowToContactMessage } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface PatchBody {
  handled?: unknown;
}

/** PATCH /api/contact/[id] — marque un message comme traité (ou non). ADMIN uniquement. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<PatchBody>(req);
  if (!body || typeof body.handled !== "boolean") {
    return badRequest("« handled » doit être un booléen");
  }

  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) return notFound("Message introuvable");

  const updated = await prisma.contactMessage.update({
    where: { id },
    data: { handled: body.handled },
  });

  return NextResponse.json(rowToContactMessage(updated));
}
