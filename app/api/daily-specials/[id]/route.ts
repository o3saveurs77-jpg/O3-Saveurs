import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDailySpecial } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { validateDailySpecialInput } from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/** Date d'une ligne existante au format « AAAA-MM-JJ », pour la fusion du PATCH. */
const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * PATCH /api/daily-specials/[id] — **administration uniquement**.
 * L'état existant est fusionné avec le corps reçu avant validation, pour que la
 * règle « une date **ou** un jour récurrent » porte sur l'état final.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.dailySpecial.findUnique({ where: { id } });
  if (!current) return notFound("Plat du jour introuvable");

  const merged: Record<string, unknown> = {
    dishId: current.dishId,
    name: current.name,
    priceCents: current.priceCents,
    weekday: current.weekday,
    date: ymd(current.date),
    active: current.active,
    position: current.position,
    ...body,
  };

  const input = validateDailySpecialInput(merged);
  if (!input.ok) return badRequest(input.error);

  if (input.value.dishId) {
    const dish = await prisma.dish.findUnique({
      where: { id: input.value.dishId },
      select: { id: true },
    });
    if (!dish) return badRequest("Le plat sélectionné n'existe plus");
  }

  const row = await prisma.dailySpecial.update({ where: { id }, data: input.value });
  return NextResponse.json(rowToDailySpecial(row));
}

/**
 * DELETE /api/daily-specials/[id] — **administration uniquement**.
 * Un plat du jour n'est référencé par aucune commande (les lignes archivent le
 * plat, pas la mise en avant) : la suppression est sans conséquence comptable.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    await prisma.dailySpecial.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return notFound("Plat du jour introuvable");
  }
}
