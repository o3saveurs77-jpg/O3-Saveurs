import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDailySpecial } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { validateDailySpecialInput, type DailySpecialPublicView } from "@/lib/promotionValidation";
import { parisNow, parisStartOfDay } from "@/lib/hours";

export const dynamic = "force-dynamic";

/**
 * GET /api/daily-specials — **publique**.
 *
 * Renvoie le ou les plats du jour applicables aujourd'hui. La table existait
 * déjà mais n'était lue par personne : l'accueil affichait une constante figée
 * (`platsDuJour` de `lib/menu.ts`) ne couvrant que mercredi, jeudi et vendredi,
 * et Laila ne pouvait pas changer son plat du jour.
 *
 * Règles :
 *  · une entrée avec `date` correspondant à aujourd'hui est **prioritaire** sur
 *    une entrée récurrente `weekday` — l'exception l'emporte sur la règle ;
 *  · le jour est calculé en heure de Paris, jamais dans le fuseau du serveur ;
 *  · le prix renvoyé est résolu : `priceCents` de l'entrée, sinon celui du plat
 *    lié, sinon `null` ;
 *  · une entrée liée à un plat retiré de la vente est masquée — annoncer un
 *    plat du jour indisponible fait perdre la commande.
 *
 * `?all=true` renvoie l'intégralité des entrées (administration uniquement).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("all") === "true") {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const rows = await prisma.dailySpecial.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { dish: { select: { name: true, priceCents: true, photo: true } } },
    });

    return NextResponse.json(
      rows.map((r) => ({
        ...rowToDailySpecial(r),
        dishName: r.dish?.name ?? null,
        dishPriceCents: r.dish?.priceCents ?? null,
        photo: r.dish?.photo ?? null,
      })),
    );
  }

  const now = new Date();
  const start = parisStartOfDay(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const { weekday } = parisNow(now);

  const rows = await prisma.dailySpecial.findMany({
    where: {
      active: true,
      OR: [{ date: { gte: start, lt: end } }, { date: null, weekday }],
    },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { dish: { select: { desc: true, photo: true, priceCents: true, available: true } } },
  });

  const dated = rows.filter((r) => r.date !== null);
  const applicable = dated.length > 0 ? dated : rows;

  const specials: DailySpecialPublicView[] = applicable
    .filter((r) => !r.dish || r.dish.available)
    .map((r) => ({
      id: r.id,
      dishId: r.dishId,
      name: r.name,
      desc: r.dish?.desc ?? "",
      photo: r.dish?.photo ?? null,
      priceCents: r.priceCents ?? r.dish?.priceCents ?? null,
      weekday: r.weekday,
      date: r.date ? r.date.getTime() : null,
      position: r.position,
      dated: r.date !== null,
    }));

  return NextResponse.json(specials);
}

/** POST /api/daily-specials — création, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const input = validateDailySpecialInput(body);
  if (!input.ok) return badRequest(input.error);

  if (input.value.dishId) {
    const dish = await prisma.dish.findUnique({
      where: { id: input.value.dishId },
      select: { id: true },
    });
    if (!dish) return badRequest("Le plat sélectionné n'existe plus");
  }

  const row = await prisma.dailySpecial.create({ data: input.value });
  return NextResponse.json(rowToDailySpecial(row), { status: 201 });
}
