import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { rowToAnnouncement, validateAnnouncementInput } from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/announcements/[id] — **administration uniquement**.
 * Fusion de l'état existant avant validation : la cohérence des dates porte sur
 * l'état final, même si le corps ne contient qu'`active`.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.announcement.findUnique({ where: { id } });
  if (!current) return notFound("Annonce introuvable");

  const merged: Record<string, unknown> = {
    message: current.message,
    link: current.link,
    tone: current.tone,
    startsAt: current.startsAt ? current.startsAt.toISOString() : null,
    endsAt: current.endsAt ? current.endsAt.toISOString() : null,
    active: current.active,
    position: current.position,
    ...body,
  };

  const input = validateAnnouncementInput(merged);
  if (!input.ok) return badRequest(input.error);

  const row = await prisma.announcement.update({ where: { id }, data: input.value });
  return NextResponse.json(rowToAnnouncement(row));
}

/** DELETE /api/announcements/[id] — **administration uniquement**. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    await prisma.announcement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return notFound("Annonce introuvable");
  }
}
