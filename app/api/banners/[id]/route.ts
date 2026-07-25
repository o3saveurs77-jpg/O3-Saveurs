import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { rowToBanner, validateBannerInput } from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/banners/[id] — **administration uniquement**.
 * `clicks` n'est jamais modifiable ici : c'est une mesure, pas un réglage. Seul
 * `POST /api/banners/[id]/click` l'incrémente.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.banner.findUnique({ where: { id } });
  if (!current) return notFound("Bannière introuvable");

  const merged: Record<string, unknown> = {
    title: current.title,
    image: current.image,
    link: current.link,
    placement: current.placement,
    startsAt: current.startsAt ? current.startsAt.toISOString() : null,
    endsAt: current.endsAt ? current.endsAt.toISOString() : null,
    active: current.active,
    position: current.position,
    ...body,
  };

  const input = validateBannerInput(merged);
  if (!input.ok) return badRequest(input.error);

  const row = await prisma.banner.update({ where: { id }, data: input.value });
  return NextResponse.json(rowToBanner(row));
}

/** DELETE /api/banners/[id] — **administration uniquement**. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    await prisma.banner.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return notFound("Bannière introuvable");
  }
}
