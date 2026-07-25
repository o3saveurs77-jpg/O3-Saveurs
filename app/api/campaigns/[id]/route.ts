/* Campagne de newsletter — consultation, modification, suppression.
 *
 * Une campagne déjà envoyée devient un enregistrement historique : elle n'est
 * ni modifiable ni supprimable. Réécrire l'objet d'un email déjà parti chez des
 * centaines de destinataires ne ferait que mentir sur ce qui a été envoyé.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound, conflict, serverError } from "@/lib/guard";
import { str, oneOf, isoDate } from "@/lib/validate";

export const dynamic = "force-dynamic";

const AUDIENCES = ["tous", "actifs", "inactifs"] as const;
const EDITABLE_STATUSES = ["brouillon", "programmee"] as const;

interface Body {
  subject?: unknown;
  html?: unknown;
  audience?: unknown;
  scheduledAt?: unknown;
  status?: unknown;
}

/** GET /api/campaigns/[id] */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) return notFound("Campagne introuvable");

  return NextResponse.json({
    id: c.id,
    subject: c.subject,
    html: c.html,
    audience: c.audience,
    status: c.status,
    scheduledAt: c.scheduledAt ? c.scheduledAt.getTime() : null,
    sentAt: c.sentAt ? c.sentAt.getTime() : null,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    createdAt: c.createdAt.getTime(),
  });
}

/** PATCH /api/campaigns/[id] — tant que la campagne n'est pas partie. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.campaign.findUnique({ where: { id } });
  if (!current) return notFound("Campagne introuvable");
  if (current.sentAt) {
    return conflict("Cette campagne a déjà été envoyée : elle n'est plus modifiable.");
  }

  const data: Record<string, unknown> = {};

  if (body.subject !== undefined) {
    const v = str(body.subject, "L'objet", { min: 3, max: 150 });
    if (!v.ok) return badRequest(v.error);
    data.subject = v.value;
  }
  if (body.html !== undefined) {
    const v = str(body.html, "Le contenu", { min: 10, max: 50_000 });
    if (!v.ok) return badRequest(v.error);
    data.html = v.value;
  }
  if (body.audience !== undefined) {
    const v = oneOf(body.audience, AUDIENCES, "L'audience");
    if (!v.ok) return badRequest(v.error);
    data.audience = v.value;
  }
  if (body.scheduledAt !== undefined) {
    const v = isoDate(body.scheduledAt, "La date d'envoi");
    if (!v.ok) return badRequest(v.error);
    data.scheduledAt = v.value;
  }
  if (body.status !== undefined) {
    // « envoyee » ne s'obtient que par la route d'envoi, jamais par un PATCH :
    // sinon les compteurs annonceraient un envoi qui n'a pas eu lieu.
    const v = oneOf(body.status, EDITABLE_STATUSES, "Le statut");
    if (!v.ok) return badRequest(v.error);
    data.status = v.value;
  }

  if (Object.keys(data).length === 0) return badRequest("Aucune modification fournie");

  try {
    await prisma.campaign.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("La campagne n'a pas pu être enregistrée.");
  }
}

/** DELETE /api/campaigns/[id] — brouillons et campagnes programmées seulement. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const current = await prisma.campaign.findUnique({ where: { id } });
  if (!current) return notFound("Campagne introuvable");
  if (current.sentAt) {
    return conflict("Une campagne envoyée est conservée comme trace : elle ne peut pas être supprimée.");
  }

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
