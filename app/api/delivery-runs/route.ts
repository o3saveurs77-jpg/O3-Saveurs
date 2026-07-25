import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { collect, str, stringArray } from "@/lib/validate";
import { parisStartOfDay } from "@/lib/hours";
import type { DeliveryRun, Order as OrderRow } from "@prisma/client";

export const dynamic = "force-dynamic";

/* Tournées de livraison (lot 4.2).
 *
 * Une tournée = un livreur + un jour + un créneau + des commandes **ordonnées**
 * (`Order.deliveryRunId`, `Order.runPosition`). Avant ce lot, une livraison
 * portait juste un nom de livreur en clair, sans ordre de passage, sans départ
 * ni retour horodatés : impossible de sortir une feuille de route, ni de savoir
 * combien d'espèces un livreur devait ramener.
 *
 * La clé de regroupement est `parisStartOfDay()` : le jour d'exploitation est
 * celui de Paris, pas celui du fuseau du serveur — sur Vercel (UTC), un service
 * du soir basculait sinon sur la date du lendemain.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Clé de date d'une tournée : minuit en heure de Paris. */
function resolveDay(param: string | null | undefined): Date | null {
  if (param === undefined || param === null || param === "") return parisStartOfDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  const d = new Date(`${param}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type RunWithOrders = DeliveryRun & {
  driver?: { name: string } | null;
  orders?: OrderRow[];
};

function runView(r: RunWithOrders) {
  const driverName = r.driver?.name ?? null;
  return {
    id: r.id,
    driverId: r.driverId,
    driverName,
    date: r.date.getTime(),
    slot: r.slot,
    status: r.status,
    notes: r.notes,
    startedAt: r.startedAt ? r.startedAt.getTime() : null,
    endedAt: r.endedAt ? r.endedAt.getTime() : null,
    createdAt: r.createdAt.getTime(),
    orders: (r.orders ?? []).map((o) => rowToOrder(o, driverName)),
  };
}

const RUN_INCLUDE = {
  driver: { select: { name: true } },
  orders: { orderBy: [{ runPosition: "asc" }, { createdAt: "asc" }] },
} as const;

/**
 * GET /api/delivery-runs?date=AAAA-MM-JJ — **administration uniquement**.
 * Les tournées du jour demandé (défaut : aujourd'hui à Paris), commandes
 * comprises et dans leur ordre de passage.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const day = resolveDay(new URL(req.url).searchParams.get("date"));
  if (!day) return badRequest("La date doit être au format AAAA-MM-JJ");

  const rows = await prisma.deliveryRun.findMany({
    where: { date: day },
    orderBy: [{ createdAt: "asc" }],
    include: RUN_INCLUDE,
  });

  return NextResponse.json({ date: day.getTime(), runs: rows.map(runView) });
}

interface PostBody {
  driverId?: unknown;
  date?: unknown;
  slot?: unknown;
  notes?: unknown;
  orderIds?: unknown;
}

/**
 * POST /api/delivery-runs — nouvelle tournée, **administration uniquement**.
 * `orderIds` est facultatif : la tournée peut être créée vide puis garnie par
 * `PATCH /api/delivery-runs/[id]`.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<PostBody>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    driverId: str(body.driverId, "Le livreur", { min: 1, max: 40 }),
    slot: str(body.slot, "Le créneau", { max: 10, required: false }),
    notes: str(body.notes, "Les notes", { max: 500, required: false }),
    orderIds: stringArray(body.orderIds, "Les commandes", { maxItems: 60, maxLen: 40 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const slot = fields.value.slot || "asap";
  if (slot !== "asap" && !HHMM.test(slot)) {
    return badRequest("Le créneau doit être « asap » ou une heure au format HH:MM");
  }

  const day = resolveDay(typeof body.date === "string" ? body.date : undefined);
  if (!day) return badRequest("La date doit être au format AAAA-MM-JJ");

  const driver = await prisma.driver.findUnique({ where: { id: fields.value.driverId } });
  if (!driver) return badRequest("Livreur introuvable");
  if (!driver.active) return badRequest(`${driver.name} n'est plus en service`);

  const orderIds = [...new Set(fields.value.orderIds.filter(Boolean))];
  if (orderIds.length) {
    const found = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, mode: true, status: true, ref: true },
    });
    if (found.length !== orderIds.length) return badRequest("Une des commandes est introuvable");
    const wrong = found.find((o) => o.mode !== "livraison");
    if (wrong) return badRequest(`La commande ${wrong.ref} est à emporter, pas à livrer`);
    const dead = found.find((o) => o.status === "annulee");
    if (dead) return badRequest(`La commande ${dead.ref} est annulée`);
  }

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.deliveryRun.create({
      data: {
        driverId: driver.id,
        date: day,
        slot,
        notes: fields.value.notes || null,
      },
    });
    // Le livreur est aussi porté par la commande : la page de suivi client et
    // les emails de statut lisent `Order.driverId`, pas la tournée.
    for (const [position, orderId] of orderIds.entries()) {
      await tx.order.update({
        where: { id: orderId },
        data: { deliveryRunId: created.id, runPosition: position, driverId: driver.id },
      });
    }
    return created.id;
  });

  const row = await prisma.deliveryRun.findUniqueOrThrow({ where: { id }, include: RUN_INCLUDE });
  return NextResponse.json(runView(row), { status: 201 });
}
