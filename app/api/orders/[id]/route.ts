import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToOrderWithDriver } from "@/lib/serialize";
import { requireAdmin, optionalUser, readJson, badRequest, notFound } from "@/lib/guard";
import { releaseStock } from "@/lib/stock";
import { nextInvoiceNumber } from "@/lib/ref";
import { sendStatusUpdate, sendInvoice } from "@/lib/email";
import { STATUS_NEXT, type OrderStatus } from "@/lib/types";
import type { OrderLine } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/[id] — une commande, réservée à son propriétaire ou à un ADMIN.
 *
 * Cette route était ouverte : `/api/orders/<id>` et la page `/facture/<id>`
 * affichaient la facture nominative de n'importe qui, adresse comprise.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await optionalUser();

  const row = await prisma.order.findUnique({
    where: { id },
    include: { driver: { select: { name: true } } },
  });
  if (!row) return notFound("Commande introuvable");

  if (!user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });

  if (user.role !== "ADMIN") {
    const owner = row.customerEmail.toLowerCase() === user.email.toLowerCase();
    const linked =
      !!row.userId &&
      row.userId === (await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } }))?.id;
    if (!owner && !linked) {
      // 404 plutôt que 403 : ne pas confirmer l'existence de la commande d'un tiers.
      return notFound("Commande introuvable");
    }
  }

  return NextResponse.json(rowToOrderWithDriver(row));
}

interface PatchBody {
  status?: OrderStatus;
  driverId?: string | null;
  paid?: boolean;
  deliveryRunId?: string | null;
  runPosition?: number | null;
}

/**
 * PATCH /api/orders/[id] — **administration uniquement**.
 *
 * Auparavant ouvert à tous : n'importe qui pouvait basculer toutes les
 * commandes en « annulée » ou « livrée ». La page de suivi client faisait même
 * avancer le statut toute seule toutes les 12 secondes.
 *
 * Les transitions suivent `STATUS_NEXT` : on ne revient pas d'une commande
 * livrée à « en cuisine », et chaque étape est horodatée pour que le tableau de
 * bord dispose de délais réels.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.order.findUnique({ where: { id } });
  if (!current) return notFound("Commande introuvable");

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (body.status !== undefined) {
    const from = current.status as OrderStatus;
    const to = body.status;
    if (from !== to) {
      const allowed = STATUS_NEXT[from] ?? [];
      if (!allowed.includes(to)) {
        return badRequest(`Transition impossible : « ${from} » → « ${to} »`);
      }
      data.status = to;
      if (to === "confirmee") data.confirmedAt = current.confirmedAt ?? now;
      if (to === "cuisine") data.cookingAt = now;
      if (to === "route") data.routeAt = now;
      if (to === "livree") data.deliveredAt = now;
      if (to === "annulee") data.canceledAt = now;
    }
  }

  if (body.driverId !== undefined) {
    if (body.driverId !== null) {
      const driver = await prisma.driver.findUnique({ where: { id: body.driverId } });
      if (!driver) return badRequest("Livreur introuvable");
    }
    data.driverId = body.driverId;
  }

  if (body.deliveryRunId !== undefined) data.deliveryRunId = body.deliveryRunId;
  if (body.runPosition !== undefined) data.runPosition = body.runPosition;

  // Encaissement manuel des commandes en espèces : sans cela, tout le chiffre
  // d'affaires en espèces restait invisible dans l'écran Facturation.
  if (body.paid !== undefined) {
    data.paid = body.paid;
    data.paymentStatus = body.paid ? "paye" : "en_attente";
    if (body.paid && current.invoiceNumber === null) {
      data.invoiceNumber = await nextInvoiceNumber();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(rowToOrderWithDriver({ ...current, driver: null }));
  }

  const updated = await prisma.order.update({
    where: { id },
    data,
    include: { driver: { select: { name: true } } },
  });

  // Une annulation rend les articles au stock.
  if (data.status === "annulee" && current.status !== "annulee") {
    const lines = safeLines(current.lines);
    await releaseStock(lines, { orderId: id, reason: "correction" }).catch((error) =>
      console.error(`[orders] remise en stock de ${id} échouée:`, error),
    );
  }

  if (data.status) {
    await sendStatusUpdate(updated).catch((error) =>
      console.error(`[orders] email de statut pour ${id} échoué:`, error),
    );
  }

  /* Encaissement en espèces : la facture part par email, comme pour un
   * paiement par carte.
   *
   * Le numéro de facture était bien attribué ci-dessus, mais `sendInvoice`
   * n'était appelé que par le webhook Stripe : une commande réglée en liquide
   * obtenait donc une facture consultable en ligne que le client ne recevait
   * jamais. `sendInvoice` porte une clé de déduplication, un double
   * encaissement ne renvoie donc pas deux fois le même document. */
  if (data.paid === true && !current.paid) {
    const origin = process.env.NEXTAUTH_URL ?? "";
    await sendInvoice(updated, `${origin}/facture/${updated.id}`).catch((error) =>
      console.error(`[orders] envoi de la facture de ${id} échoué:`, error),
    );
  }

  return NextResponse.json(rowToOrderWithDriver(updated));
}

function safeLines(raw: string): OrderLine[] {
  try {
    return JSON.parse(raw) as OrderLine[];
  } catch {
    return [];
  }
}
