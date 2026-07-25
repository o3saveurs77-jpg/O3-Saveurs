import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToPromotion } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound, conflict } from "@/lib/guard";
import { describePromotion, validatePromotionInput } from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/** GET /api/promotions/[id] — **administration uniquement**. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const row = await prisma.promotion.findUnique({ where: { id } });
  if (!row) return notFound("Promotion introuvable");

  const view = rowToPromotion(row);
  return NextResponse.json({ ...view, description: describePromotion(view) });
}

/**
 * PATCH /api/promotions/[id] — **administration uniquement**.
 *
 * La ligne existante est fusionnée avec le corps reçu **avant** validation : on
 * valide toujours l'état final complet, jamais un fragment. Sans cela, passer
 * `kind` à `percent` sans renvoyer `value` laisserait un montant en centimes
 * interprété comme un pourcentage de 1 500 %.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.promotion.findUnique({ where: { id } });
  if (!current) return notFound("Promotion introuvable");

  const merged: Record<string, unknown> = {
    code: current.code,
    label: current.label,
    kind: current.kind,
    value: current.value,
    minSubtotalCents: current.minSubtotalCents,
    startsAt: current.startsAt ? current.startsAt.toISOString() : null,
    endsAt: current.endsAt ? current.endsAt.toISOString() : null,
    maxUses: current.maxUses,
    oncePerCustomer: current.oncePerCustomer,
    weekday: current.weekday,
    auto: current.auto,
    active: current.active,
    ...body,
  };

  const input = validatePromotionInput(merged);
  if (!input.ok) return badRequest(input.error);

  if (input.value.code && input.value.code !== current.code) {
    const taken = await prisma.promotion.findUnique({
      where: { code: input.value.code },
      select: { id: true },
    });
    if (taken) return conflict(`Le code ${input.value.code} est déjà utilisé par une autre promotion`);
  }

  try {
    const row = await prisma.promotion.update({ where: { id }, data: input.value });
    return NextResponse.json(rowToPromotion(row));
  } catch {
    return conflict("La promotion n'a pas pu être enregistrée (code déjà utilisé ?)");
  }
}

/**
 * DELETE /api/promotions/[id] — **administration uniquement**.
 *
 * Une promotion déjà utilisée n'est pas supprimée mais désactivée : les
 * commandes historiques la référencent par `promotionId`, et le chiffre
 * d'affaires généré doit rester justifiable. Même logique que pour un plat déjà
 * commandé.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const promo = await prisma.promotion.findUnique({
    where: { id },
    select: { id: true, label: true, code: true },
  });
  if (!promo) return notFound("Promotion introuvable");

  const used = await prisma.order.count({ where: { promotionId: id } });

  if (used > 0) {
    await prisma.promotion.update({ where: { id }, data: { active: false } });
    return NextResponse.json({
      ok: true,
      archived: true,
      message: `« ${promo.label} » a déjà été utilisée ${used} fois : elle est désactivée plutôt que supprimée, pour préserver l'historique des commandes.`,
    });
  }

  try {
    await prisma.promotion.delete({ where: { id } });
    return NextResponse.json({ ok: true, archived: false });
  } catch {
    return conflict("Cette promotion est référencée ailleurs et n'a pas pu être supprimée.");
  }
}
