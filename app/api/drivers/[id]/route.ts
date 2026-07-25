import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { str, phone, bool } from "@/lib/validate";

export const dynamic = "force-dynamic";

/* Un livreur : modification et retrait.
 *
 * Le retrait ne supprime jamais un livreur qui a déjà roulé : les tournées et
 * les commandes passées portent son identifiant, et l'effacer viderait
 * l'historique de livraison (qui a livré quoi, qui a encaissé combien). Un
 * livreur qui part est donc **désactivé** : il disparaît des affectations, son
 * passé reste consultable.
 */

interface PatchBody {
  name?: unknown;
  phone?: unknown;
  vehicle?: unknown;
  active?: unknown;
}

/** PATCH /api/drivers/[id] — **administration uniquement**. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.driver.findUnique({ where: { id } });
  if (!current) return notFound("Livreur introuvable");

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const v = str(body.name, "Le nom du livreur", { min: 2, max: 80 });
    if (!v.ok) return badRequest(v.error);
    const twin = await prisma.driver.findFirst({
      where: { name: v.value, id: { not: id } },
      select: { id: true },
    });
    if (twin) return badRequest("Un livreur porte déjà ce nom");
    data.name = v.value;
  }

  if (body.phone !== undefined) {
    const v = phone(body.phone, { required: false });
    if (!v.ok) return badRequest(v.error);
    data.phone = v.value;
  }

  if (body.vehicle !== undefined) {
    const v = str(body.vehicle, "Le véhicule", { max: 40, required: false });
    if (!v.ok) return badRequest(v.error);
    data.vehicle = v.value || null;
  }

  if (body.active !== undefined) data.active = bool(body.active, current.active);

  if (Object.keys(data).length === 0) return badRequest("Aucune modification fournie");

  const row = await prisma.driver.update({
    where: { id },
    data,
    include: { _count: { select: { runs: true, orders: true } } },
  });

  return NextResponse.json({
    id: row.id,
    name: row.name,
    phone: row.phone,
    vehicle: row.vehicle,
    active: row.active,
    createdAt: row.createdAt.getTime(),
    runsTotal: row._count.runs,
    ordersTotal: row._count.orders,
  });
}

/**
 * DELETE /api/drivers/[id] — **administration uniquement**.
 *
 * Suppression réelle seulement pour un livreur sans aucune course. Dès qu'il a
 * une tournée ou une commande à son nom, la réponse est une **désactivation**,
 * signalée par `deactivated: true` pour que l'écran affiche le bon message.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const current = await prisma.driver.findUnique({
    where: { id },
    include: { _count: { select: { runs: true, orders: true } } },
  });
  if (!current) return notFound("Livreur introuvable");

  const history = current._count.runs + current._count.orders;

  if (history > 0) {
    if (!current.active) {
      return NextResponse.json({
        deleted: false,
        deactivated: true,
        message: `${current.name} est déjà désactivé — son historique de ${history} course(s) est conservé.`,
      });
    }
    await prisma.driver.update({ where: { id }, data: { active: false } });
    return NextResponse.json({
      deleted: false,
      deactivated: true,
      message: `${current.name} a ${history} course(s) à son nom : il a été désactivé, pas supprimé, pour préserver l'historique.`,
    });
  }

  await prisma.driver.delete({ where: { id } });
  return NextResponse.json({
    deleted: true,
    deactivated: false,
    message: `${current.name} a été supprimé.`,
  });
}
