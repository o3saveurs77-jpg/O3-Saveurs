/* Tournée telle que la voit un livreur, et actions qu'il peut y mener.
 *
 * Partagé par les deux portes d'entrée :
 *
 *  · `/api/tournee/[token]` — lien privé reçu par SMS, sans compte ;
 *  · `/api/livreur/tournee` — compte Auth0 portant le rôle LIVREUR.
 *
 * Les deux doivent se comporter **exactement pareil** : mêmes données
 * renvoyées, mêmes règles de clôture, mêmes emails déclenchés. Deux
 * implémentations auraient divergé au premier correctif, et un livreur aurait
 * pu clore un arrêt d'une façon qu'un autre ne pouvait pas.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { sendStatusUpdate, sendDriverIncident } from "@/lib/email";
import { cashToCollect, checkDelivery } from "@/lib/deliveryAccess";
import type { OrderLine } from "@/lib/types";

type OrderRow = {
  id: string;
  ref: string;
  status: string;
  runPosition: number | null;
  customerName: string;
  customerPhone: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  totalCents: number;
  paid: boolean;
  paymentMethod: string;
  lines: string;
  deliveryCode: string | null;
  deliveredWithoutCode: boolean;
  driverNote: string;
};

export interface RunWithOrders {
  id: string;
  date: Date;
  status: string;
  driver: { name: string };
  orders: OrderRow[];
}

/** Ce que le livreur a besoin de voir d'un arrêt, et rien de plus. */
function toStop(o: OrderRow) {
  let items: { qty: number; name: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(o.lines);
    if (Array.isArray(parsed)) {
      items = (parsed as OrderLine[]).map((l) => ({ qty: l.qty, name: l.name }));
    }
  } catch {
    /* lignes illisibles : l'arrêt reste livrable, le détail manquera */
  }

  return {
    id: o.id,
    ref: o.ref,
    status: o.status,
    position: o.runPosition,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: [o.address, [o.zip, o.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    totalCents: o.totalCents,
    paid: o.paid,
    paymentMethod: o.paymentMethod,
    /* Le code n'est **jamais** renvoyé : le livreur doit l'entendre du client,
     * sinon la preuve de remise ne prouve rien. */
    hasCode: !!o.deliveryCode,
    deliveredWithoutCode: o.deliveredWithoutCode,
    driverNote: o.driverNote,
    items,
  };
}

/** Charge utile de la tournée, identique quelle que soit la porte d'entrée. */
export function runPayload(run: RunWithOrders) {
  return {
    runId: run.id,
    driverName: run.driver.name,
    date: run.date.toISOString(),
    status: run.status,
    stops: run.orders.map(toStop),
    cashToCollectCents: cashToCollect(
      run.orders.map((o) => ({
        paid: o.paid,
        paymentMethod: o.paymentMethod,
        totalCents: o.totalCents,
        status: o.status,
      })),
    ),
  };
}

export type ActionResult =
  | { ok: true; withoutCode?: boolean }
  | { ok: false; error: string };

/**
 * Applique une action du livreur sur un arrêt de sa tournée.
 *
 * L'arrêt est cherché **dans la tournée fournie** : c'est ce qui empêche
 * d'agir sur une commande qui n'y appartient pas, quelle que soit la façon
 * dont l'appelant s'est authentifié.
 */
export async function applyStopAction(
  run: RunWithOrders,
  input: { orderId: string; action: string; code: string; reason: string },
): Promise<ActionResult> {
  const order = run.orders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false, error: "Cet arrêt ne fait pas partie de la tournée." };
  if (order.status === "annulee") return { ok: false, error: "Cette commande a été annulée." };

  switch (input.action) {
    case "livree": {
      if (order.status === "livree") return { ok: false, error: "Cet arrêt est déjà clos." };

      const verdict = checkDelivery(order.deliveryCode, input.code, input.reason);
      if (!verdict.ok) return { ok: false, error: verdict.error };

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "livree",
          deliveredAt: new Date(),
          deliveredWithoutCode: verdict.withoutCode,
          driverNote: verdict.withoutCode ? input.reason : order.driverNote,
        },
      });

      await sendStatusUpdate(updated).catch((error) =>
        console.error(`[tournee] email de livraison pour ${order.id} échoué:`, error),
      );

      return { ok: true, withoutCode: verdict.withoutCode };
    }

    case "encaisse": {
      if (order.paid) return { ok: false, error: "Cette commande est déjà réglée." };

      /* Le livreur encaisse, il ne facture pas : le numéro de facture reste
       * attribué par le back-office, qui seul sait si les mentions légales
       * sont complètes. */
      await prisma.order.update({
        where: { id: order.id },
        data: { paid: true, paymentStatus: "paye" },
      });

      return { ok: true };
    }

    case "incident": {
      if (input.reason.trim().length < 3) {
        return { ok: false, error: "Décrivez brièvement le problème." };
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { driverNote: input.reason, incidentAt: new Date() },
      });

      /* Le signalement doit sortir de la base : pendant un service, personne
       * ne va y lire qu'un client est absent devant sa porte. */
      await sendDriverIncident(updated, input.reason).catch((error) =>
        console.error(`[tournee] alerte d'incident pour ${order.id} échouée:`, error),
      );

      return { ok: true };
    }

    default:
      return { ok: false, error: "Action inconnue." };
  }
}

/** Sélection commune : arrêts dans l'ordre de la tournée. */
/* Sans `as const` : Prisma refuse des tableaux en lecture seule pour `orderBy`. */
export const RUN_INCLUDE = {
  driver: { select: { name: true } },
  orders: { orderBy: [{ runPosition: "asc" as const }, { createdAt: "asc" as const }] },
};
