import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound, conflict } from "@/lib/guard";
import { str, oneOf, stringArray, isoDate } from "@/lib/validate";
import type { DeliveryRun, Order as OrderRow, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/* Une tournée : statut, départ/retour, affectation et ordre de passage.
 *
 * `orderIds` est **la liste ordonnée définitive** des commandes de la tournée :
 * un seul champ sert donc à affecter, retirer et réordonner. Deux chemins
 * séparés (ajout / déplacement) finissaient toujours par produire des positions
 * en double ou des trous.
 */

const RUN_STATUSES = ["preparee", "en_cours", "terminee", "annulee"] as const;
type RunStatus = (typeof RUN_STATUSES)[number];

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  preparee: "préparée",
  en_cours: "en cours",
  terminee: "terminée",
  annulee: "annulée",
};

/** Une tournée terminée ou annulée est close : on ne la relance pas. */
const RUN_STATUS_NEXT: Record<RunStatus, RunStatus[]> = {
  preparee: ["en_cours", "annulee"],
  en_cours: ["terminee", "annulee"],
  terminee: [],
  annulee: [],
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

/**
 * Typé `Prisma.DeliveryRunInclude` et non `as const` : `as const` produit des
 * tableaux en lecture seule, refusés par les types générés pour un `orderBy`.
 */
const RUN_INCLUDE: Prisma.DeliveryRunInclude = {
  driver: { select: { name: true } },
  orders: { orderBy: [{ runPosition: "asc" }, { createdAt: "asc" }] },
};

/** GET /api/delivery-runs/[id] — **administration uniquement**. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const row = await prisma.deliveryRun.findUnique({ where: { id }, include: RUN_INCLUDE });
  if (!row) return notFound("Tournée introuvable");

  return NextResponse.json(runView(row));
}

interface PatchBody {
  status?: unknown;
  driverId?: unknown;
  slot?: unknown;
  notes?: unknown;
  orderIds?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
}

/**
 * PATCH /api/delivery-runs/[id] — **administration uniquement**.
 *
 * Les statuts suivent `RUN_STATUS_NEXT`. Le départ et le retour sont horodatés
 * automatiquement au changement de statut (`startedAt`, `endedAt`) ; ils peuvent
 * aussi être corrigés à la main en passant une date ISO, car Laila démarre
 * parfois la tournée dans l'application après le départ réel du livreur.
 *
 * Le statut des commandes n'est **pas** modifié ici : le passage en « en route »
 * ou « livrée » se fait commande par commande via `PATCH /api/orders/[id]`, seul
 * endroit qui applique `STATUS_NEXT`, horodate l'étape et prévient le client par
 * email. Une tournée annulée relâche ses commandes dans la file à affecter.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.deliveryRun.findUnique({
    where: { id },
    include: { orders: { select: { id: true } } },
  });
  if (!current) return notFound("Tournée introuvable");

  const from = current.status as RunStatus;
  const data: Record<string, unknown> = {};
  const now = new Date();
  let to: RunStatus = from;

  // ── Statut ──
  if (body.status !== undefined) {
    const v = oneOf(body.status, RUN_STATUSES, "Le statut de la tournée");
    if (!v.ok) return badRequest(v.error);
    to = v.value;
    if (to !== from) {
      if (!(RUN_STATUS_NEXT[from] ?? []).includes(to)) {
        return badRequest(
          `Transition impossible : une tournée ${RUN_STATUS_LABEL[from]} ne peut pas passer ${RUN_STATUS_LABEL[to]}`,
        );
      }
      data.status = to;
      if (to === "en_cours") data.startedAt = current.startedAt ?? now;
      if (to === "terminee") {
        data.startedAt = current.startedAt ?? now;
        data.endedAt = now;
      }
      if (to === "annulee") data.endedAt = current.endedAt ?? now;
    }
  }

  // ── Horodatages corrigés à la main ──
  for (const key of ["startedAt", "endedAt"] as const) {
    if (body[key] === undefined) continue;
    const v = isoDate(body[key], key === "startedAt" ? "L'heure de départ" : "L'heure de retour");
    if (!v.ok) return badRequest(v.error);
    data[key] = v.value;
  }
  if (
    data.startedAt instanceof Date &&
    data.endedAt instanceof Date &&
    data.endedAt < data.startedAt
  ) {
    return badRequest("L'heure de retour ne peut pas précéder l'heure de départ");
  }

  // ── Créneau et notes ──
  if (body.slot !== undefined) {
    const v = str(body.slot, "Le créneau", { max: 10, required: false });
    if (!v.ok) return badRequest(v.error);
    const slot = v.value || "asap";
    if (slot !== "asap" && !HHMM.test(slot)) {
      return badRequest("Le créneau doit être « asap » ou une heure au format HH:MM");
    }
    data.slot = slot;
  }

  if (body.notes !== undefined) {
    const v = str(body.notes, "Les notes", { max: 500, required: false });
    if (!v.ok) return badRequest(v.error);
    data.notes = v.value || null;
  }

  // ── Livreur ──
  let driverId = current.driverId;
  if (body.driverId !== undefined) {
    const v = str(body.driverId, "Le livreur", { min: 1, max: 40 });
    if (!v.ok) return badRequest(v.error);
    if (v.value !== current.driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: v.value } });
      if (!driver) return badRequest("Livreur introuvable");
      if (!driver.active) return badRequest(`${driver.name} n'est plus en service`);
      data.driverId = driver.id;
      driverId = driver.id;
    }
  }

  // ── Commandes : liste ordonnée définitive ──
  let attach: string[] | null = null;
  let detach: string[] = [];

  if (body.orderIds !== undefined) {
    const v = stringArray(body.orderIds, "Les commandes", { maxItems: 60, maxLen: 40 });
    if (!v.ok) return badRequest(v.error);
    attach = [...new Set(v.value.filter(Boolean))];

    if (attach.length) {
      const found = await prisma.order.findMany({
        where: { id: { in: attach } },
        select: { id: true, ref: true, mode: true, status: true },
      });
      if (found.length !== attach.length) return badRequest("Une des commandes est introuvable");
      const wrong = found.find((o) => o.mode !== "livraison");
      if (wrong) return badRequest(`La commande ${wrong.ref} est à emporter, pas à livrer`);
      const dead = found.find((o) => o.status === "annulee");
      if (dead) return badRequest(`La commande ${dead.ref} est annulée`);
    }

    const kept = new Set(attach);
    detach = current.orders.map((o) => o.id).filter((oid) => !kept.has(oid));
  }

  // Une tournée annulée relâche tout : ses commandes doivent pouvoir repartir
  // dans une autre tournée au lieu de rester bloquées.
  if (to === "annulee" && from !== "annulee") {
    attach = [];
    detach = current.orders.map((o) => o.id);
  }

  const reassignDriver = data.driverId !== undefined;

  if (Object.keys(data).length === 0 && attach === null) {
    return badRequest("Aucune modification fournie");
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.deliveryRun.update({ where: { id }, data });

    for (const orderId of detach) {
      await tx.order.update({
        where: { id: orderId },
        data: { deliveryRunId: null, runPosition: null, driverId: null },
      });
    }

    if (attach) {
      for (const [position, orderId] of attach.entries()) {
        await tx.order.update({
          where: { id: orderId },
          data: { deliveryRunId: id, runPosition: position, driverId },
        });
      }
    } else if (reassignDriver) {
      // Changement de livreur sans toucher à la composition de la tournée.
      await tx.order.updateMany({ where: { deliveryRunId: id }, data: { driverId } });
    }
  });

  const row = await prisma.deliveryRun.findUniqueOrThrow({ where: { id }, include: RUN_INCLUDE });
  return NextResponse.json(runView(row));
}

/**
 * DELETE /api/delivery-runs/[id] — **administration uniquement**.
 *
 * Refusé dès qu'une tournée non vide a commencé : la supprimer effacerait
 * l'heure de départ et l'ordre de passage de commandes déjà en route. Dans ce
 * cas, il faut l'annuler (`PATCH { status: "annulee" }`), ce qui conserve la
 * trace et relâche les commandes.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const current = await prisma.deliveryRun.findUnique({
    where: { id },
    include: { orders: { select: { id: true } } },
  });
  if (!current) return notFound("Tournée introuvable");

  const started = current.startedAt !== null || current.status !== "preparee";
  if (current.orders.length > 0 && started) {
    return conflict(
      `Cette tournée est ${RUN_STATUS_LABEL[current.status as RunStatus] ?? current.status} et contient ${current.orders.length} commande(s) : annulez-la au lieu de la supprimer, l'historique doit être conservé.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (current.orders.length) {
      await tx.order.updateMany({
        where: { deliveryRunId: id },
        data: { deliveryRunId: null, runPosition: null, driverId: null },
      });
    }
    await tx.deliveryRun.delete({ where: { id } });
  });

  return NextResponse.json({ deleted: true });
}
