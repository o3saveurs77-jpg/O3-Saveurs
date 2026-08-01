import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToBudgetItem } from "@/lib/serialize";
import { validateBudgetItemInput } from "@/lib/promotionValidation";
import { badRequest, notFound, readJson, requireAdmin, serverError } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/budget/[id] — **administration uniquement**.
 *
 * Fusionne la ligne existante avec le corps reçu avant validation : on valide
 * toujours l'état final complet, jamais un fragment (même règle que les
 * promotions — voir `app/api/promotions/[id]/route.ts`).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.budgetItem.findUnique({ where: { id } });
  if (!current) return notFound("Ligne introuvable");

  const merged: Record<string, unknown> = {
    category: current.category,
    label: current.label,
    qty: current.qty,
    unit: current.unit,
    unitPriceCents: current.unitPriceCents,
    packaging: current.packaging,
    position: current.position,
    ...body,
  };

  const input = validateBudgetItemInput(merged);
  if (!input.ok) return badRequest(input.error);

  try {
    const row = await prisma.budgetItem.update({ where: { id }, data: input.value });
    return NextResponse.json(rowToBudgetItem(row));
  } catch {
    return serverError("La ligne n'a pas pu être enregistrée");
  }
}

/** DELETE /api/budget/[id] — **administration uniquement**. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const current = await prisma.budgetItem.findUnique({ where: { id }, select: { id: true } });
  if (!current) return notFound("Ligne introuvable");

  await prisma.budgetItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
