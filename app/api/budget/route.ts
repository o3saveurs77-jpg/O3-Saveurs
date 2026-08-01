/* Liste de courses & budget prévisionnel — achats de matières premières.
 *
 * Distinct des `Dish.costCents` (marge par plat vendu) et de `StockMovement`
 * (mouvements de plats déjà en carte) : cet écran sert à préparer un budget
 * d'achat pour une période à venir (un événement, une semaine type…), avant
 * même que les plats ne soient cuisinés. Les totaux ne sont jamais stockés,
 * toujours recalculés à la lecture pour ne jamais diverger d'un prix modifié.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToBudgetItem } from "@/lib/serialize";
import { validateBudgetItemInput } from "@/lib/promotionValidation";
import { badRequest, readJson, requireAdmin, serverError } from "@/lib/guard";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/budget — **administration uniquement**. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let rows;
  try {
    rows = await prisma.budgetItem.findMany({ orderBy: [{ category: "asc" }, { position: "asc" }] });
  } catch {
    return serverError("Liste de courses indisponible");
  }

  const items = rows.map(rowToBudgetItem);

  const [caCents, days] = await Promise.all([
    getSetting("budget.caCents").then(Number),
    getSetting("budget.days").then(Number),
  ]);

  const totalMatieresCents = items
    .filter((i) => !i.packaging)
    .reduce((s, i) => s + i.totalCents, 0);
  const totalEmballagesCents = items
    .filter((i) => i.packaging)
    .reduce((s, i) => s + i.totalCents, 0);
  const totalGeneralCents = totalMatieresCents + totalEmballagesCents;

  return NextResponse.json({
    items,
    caCents,
    days,
    totalMatieresCents,
    totalEmballagesCents,
    totalGeneralCents,
    // null quand le CA ou le nombre de jours n'est pas encore renseigné : l'écran
    // affiche alors un repli plutôt qu'un pourcentage ou un montant absurde.
    coutMatierePct: caCents > 0 ? (totalMatieresCents / caCents) * 100 : null,
    budgetParJourCents: days > 0 ? Math.round(totalMatieresCents / days) : null,
  });
}

/** POST /api/budget — création d'une ligne, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const input = validateBudgetItemInput(body);
  if (!input.ok) return badRequest(input.error);

  // Nouvelle ligne ajoutée en fin de sa catégorie.
  const last = await prisma.budgetItem.findFirst({
    where: { category: input.value.category },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  try {
    const row = await prisma.budgetItem.create({
      data: { ...input.value, position: (last?.position ?? -1) + 1 },
    });
    return NextResponse.json(rowToBudgetItem(row), { status: 201 });
  } catch {
    return serverError("La ligne n'a pas pu être enregistrée");
  }
}
