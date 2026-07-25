import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { collect, str, phone, bool } from "@/lib/validate";
import { parisStartOfDay } from "@/lib/hours";

export const dynamic = "force-dynamic";

/* Livreurs réels (lot 4.1).
 *
 * `LivraisonsAdmin` affectait ses courses à une liste codée en dur dans
 * `lib/mockOrders.ts` (« Samir », « Kevin », « Dramane », « Élodie ») : Laila ne
 * pouvait donc affecter une livraison qu'à quatre personnes fictives, et rien de
 * ce qu'elle saisissait ne survivait à un rechargement.
 *
 * Toute cette ressource est réservée à l'administration : elle expose des
 * numéros de téléphone de salariés, qui n'ont rien à faire dans une réponse
 * publique.
 */

/** Clé de date d'une tournée : minuit en heure de Paris (voir `lib/hours.ts`). */
function resolveDay(param: string | null): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(`${param}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return parisStartOfDay();
}

/**
 * GET /api/drivers — liste des livreurs, **administration uniquement**.
 *
 * `?date=AAAA-MM-JJ` (défaut : aujourd'hui en heure de Paris) ajoute pour chaque
 * livreur l'activité du jour, calculée sur ses tournées : nombre de tournées,
 * d'arrêts, de commandes livrées, montant restant à encaisser et montant déjà
 * encaissé. `?active=true` ne renvoie que les livreurs en service — ce que
 * consomme le sélecteur d'affectation.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const day = resolveDay(url.searchParams.get("date"));
  const onlyActive = url.searchParams.get("active") === "true";

  const [drivers, runs] = await Promise.all([
    prisma.driver.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { runs: true, orders: true } } },
    }),
    prisma.deliveryRun.findMany({
      where: { date: day, status: { not: "annulee" } },
      select: {
        driverId: true,
        orders: { select: { totalCents: true, paid: true, status: true } },
      },
    }),
  ]);

  return NextResponse.json(
    drivers.map((d) => {
      const mine = runs.filter((r) => r.driverId === d.id);
      const stops = mine.flatMap((r) => r.orders);
      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        vehicle: d.vehicle,
        active: d.active,
        createdAt: d.createdAt.getTime(),
        /** historique complet : sert à décider suppression ou désactivation */
        runsTotal: d._count.runs,
        ordersTotal: d._count.orders,
        today: {
          date: day.getTime(),
          runs: mine.length,
          stops: stops.length,
          delivered: stops.filter((o) => o.status === "livree").length,
          /** encore à encaisser (espèces à la porte) */
          toCollectCents: stops
            .filter((o) => !o.paid && o.status !== "annulee")
            .reduce((s, o) => s + o.totalCents, 0),
          collectedCents: stops.filter((o) => o.paid).reduce((s, o) => s + o.totalCents, 0),
        },
      };
    }),
  );
}

interface PostBody {
  name?: unknown;
  phone?: unknown;
  vehicle?: unknown;
  active?: unknown;
}

/** POST /api/drivers — nouveau livreur, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<PostBody>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    name: str(body.name, "Le nom du livreur", { min: 2, max: 80 }),
    phone: phone(body.phone, { required: false }),
    vehicle: str(body.vehicle, "Le véhicule", { max: 40, required: false }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const twin = await prisma.driver.findFirst({
    where: { name: fields.value.name },
    select: { id: true },
  });
  if (twin) return badRequest("Un livreur porte déjà ce nom");

  const row = await prisma.driver.create({
    data: {
      name: fields.value.name,
      phone: fields.value.phone,
      vehicle: fields.value.vehicle || null,
      active: bool(body.active, true),
    },
  });

  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      phone: row.phone,
      vehicle: row.vehicle,
      active: row.active,
      createdAt: row.createdAt.getTime(),
      runsTotal: 0,
      ordersTotal: 0,
      today: {
        date: parisStartOfDay().getTime(),
        runs: 0,
        stops: 0,
        delivered: 0,
        toCollectCents: 0,
        collectedCents: 0,
      },
    },
    { status: 201 },
  );
}
