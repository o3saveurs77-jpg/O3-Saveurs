import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDish, dishToRow } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound, conflict } from "@/lib/guard";
import { validateDishFields } from "@/lib/dishValidation";
import { str } from "@/lib/validate";
import type { Dish } from "@/lib/menu";

export const dynamic = "force-dynamic";

/** GET /api/dishes/[id] — fiche publique d'un plat. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.dish.findUnique({ where: { id } });
  if (!row) return notFound("Plat introuvable");
  return NextResponse.json(rowToDish(row));
}

/**
 * PATCH /api/dishes/[id] — **administration uniquement**.
 * Cette route était ouverte : un `PATCH` anonyme suffisait à mettre tous les
 * prix de la carte à 0,01 €, et ces prix étaient ensuite servis au panier.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Partial<Dish>>(req);
  if (!body) return badRequest("Requête invalide");

  /* Même contrat que le POST : ce que la création refuse, la modification le
   * refuse aussi. On ne valide que les champs réellement envoyés. */
  if ("name" in body) {
    const name = str(body.name, "Le nom", { min: 2, max: 120 });
    if (!name.ok) return badRequest(name.error);
  }
  if ("cat" in body) {
    const cat = str(body.cat, "La catégorie", { min: 1, max: 40 });
    if (!cat.ok) return badRequest(cat.error);
  }
  if ("desc" in body) {
    const desc = str(body.desc, "La description", { max: 500, required: false });
    if (!desc.ok) return badRequest(desc.error);
  }

  const priced = validateDishFields(body);
  if (!priced.ok) return badRequest(priced.error);

  try {
    const row = await prisma.dish.update({
      where: { id },
      data: dishToRow({ ...body, ...priced.value }) as never,
    });
    return NextResponse.json(rowToDish(row));
  } catch {
    return notFound("Plat introuvable");
  }
}

/**
 * DELETE /api/dishes/[id] — **administration uniquement**.
 *
 * Un plat déjà commandé n'est pas supprimé mais retiré de la vente : les lignes
 * de commande archivent le nom et le prix, mais l'historique et les statistiques
 * s'appuient sur `dishId`. Supprimer romprait la traçabilité comptable.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const dish = await prisma.dish.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!dish) return notFound("Plat introuvable");

  const ordered = await prisma.stockMovement.count({
    where: { dishId: id, reason: "vente" },
  });

  if (ordered > 0) {
    await prisma.dish.update({ where: { id }, data: { available: false, popular: false } });
    return NextResponse.json({
      ok: true,
      archived: true,
      message: `« ${dish.name} » a déjà été commandé : il est retiré de la vente plutôt que supprimé, pour préserver l'historique.`,
    });
  }

  try {
    await prisma.dish.delete({ where: { id } });
    return NextResponse.json({ ok: true, archived: false });
  } catch {
    return conflict("Ce plat est référencé ailleurs et n'a pas pu être supprimé.");
  }
}
