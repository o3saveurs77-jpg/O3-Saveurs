import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { rowToCateringInquiry } from "@/lib/serialize";
import { CATERING_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PatchBody {
  status?: unknown;
  note?: unknown;
}

/** PATCH /api/traiteur/[id] — met à jour le statut / la note interne. ADMIN uniquement. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { status?: string; note?: string } = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(CATERING_STATUSES as readonly string[]).includes(body.status)) {
      return badRequest("« status » invalide");
    }
    data.status = body.status;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.length > 2000) {
      return badRequest("« note » doit être du texte de 2000 caractères maximum");
    }
    data.note = body.note;
  }
  if (Object.keys(data).length === 0) return badRequest("Rien à mettre à jour");

  const existing = await prisma.cateringInquiry.findUnique({ where: { id } });
  if (!existing) return notFound("Demande introuvable");

  const updated = await prisma.cateringInquiry.update({ where: { id }, data });
  return NextResponse.json(rowToCateringInquiry(updated));
}
