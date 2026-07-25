/* Réclamations (service après-vente) — ouverture et liste.
 *
 * Points de vigilance :
 *
 *  · **Rattachement à une commande.** Une réclamation peut viser une commande,
 *    mais seulement si le demandeur en est le destinataire. Une commande d'un
 *    tiers renvoie 404 et non 403 : répondre « interdit » confirmerait que
 *    l'identifiant existe, ce qui suffit à énumérer les commandes.
 *
 *  · **Cloisonnement de la liste.** Un ADMIN voit la file complète ; un client
 *    ne voit que ses propres réclamations ; un visiteur anonyme n'obtient rien.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToTicket } from "@/lib/serialize";
import {
  optionalUser,
  requireUser,
  readJson,
  badRequest,
  notFound,
  serverError,
} from "@/lib/guard";
import { collect, str, email as emailField, oneOf } from "@/lib/validate";
import { sendTicketOpened } from "@/lib/email";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PRIORITIES = ["basse", "normale", "haute"] as const;
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

interface Body {
  subject?: unknown;
  category?: unknown;
  message?: unknown;
  orderId?: unknown;
  name?: unknown;
  email?: unknown;
}

/**
 * POST /api/tickets — ouverture d'une réclamation.
 *
 * Ouverte aux visiteurs non connectés : une commande passée en invité donne
 * droit au même service après-vente. Dans ce cas, le rattachement à une
 * commande exige que l'email fourni soit celui de la commande.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const session = await optionalUser();

  const fields = collect({
    subject: str(body.subject, "L'objet", { min: 4, max: 150 }),
    category: oneOf(body.category ?? "autre", TICKET_CATEGORIES, "Le motif"),
    message: str(body.message, "La description", { min: 10, max: 4000 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  // Identité : la session prime toujours sur le corps de la requête. Un client
  // connecté ne peut pas ouvrir une réclamation au nom d'un autre.
  let customerEmail: string;
  let customerName: string;
  let userId: string | null = null;

  if (session) {
    const account = await prisma.user.findUnique({
      where: { email: session.email },
      select: { id: true, name: true },
    });
    userId = account?.id ?? null;
    customerEmail = session.email.toLowerCase();
    customerName = account?.name || session.name || "Client";
  } else {
    const identity = collect({
      name: str(body.name, "Le nom", { min: 2, max: 80 }),
      email: emailField(body.email),
    });
    if (!identity.ok) return badRequest(identity.error);
    customerName = identity.value.name;
    customerEmail = identity.value.email;
  }

  // ─── Rattachement facultatif à une commande ───
  let orderId: string | null = null;
  if (typeof body.orderId === "string" && body.orderId !== "") {
    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      select: { id: true, userId: true, customerEmail: true },
    });
    const mine =
      !!order &&
      ((userId !== null && order.userId === userId) ||
        order.customerEmail.toLowerCase() === customerEmail);
    // 404 volontaire : ne pas confirmer l'existence de la commande d'un tiers.
    if (!mine) return notFound("Commande introuvable");
    orderId = order.id;
  }

  try {
    const created = await prisma.supportTicket.create({
      data: {
        orderId,
        userId,
        customerName,
        customerEmail,
        subject: fields.value.subject,
        category: fields.value.category,
        // Statut et priorité ne viennent jamais du client : une réclamation
        // s'ouvre toujours « ouverte » et « normale ».
        status: "ouvert",
        priority: "normale",
        messages: {
          create: [{ author: "CLIENT", body: fields.value.message }],
        },
      },
      include: { messages: { orderBy: { createdAt: "asc" } }, order: { select: { ref: true } } },
    });

    // L'email ne doit pas faire échouer l'ouverture de la réclamation.
    await sendTicketOpened(customerEmail, created.subject, created.id).catch(() => {});

    return NextResponse.json(rowToTicket(created), { status: 201 });
  } catch {
    return serverError("La réclamation n'a pas pu être enregistrée.");
  }
}

/** GET /api/tickets — file d'attente (ADMIN) ou mes réclamations (client). */
export async function GET(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const isAdmin = guard.user.role === "ADMIN";

  const take = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("take")) || PAGE_SIZE),
  );
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);

  const where: Prisma.SupportTicketWhereInput = isAdmin
    ? {}
    : { customerEmail: guard.user.email.toLowerCase() };

  // Les filtres du back-office ne sont ouverts qu'à l'administration ; pour un
  // client, aucun paramètre ne peut élargir le périmètre.
  if (isAdmin) {
    const status = url.searchParams.get("status");
    if (status && (TICKET_STATUSES as readonly string[]).includes(status)) where.status = status;

    const priority = url.searchParams.get("priority");
    if (priority && (PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
  }

  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      include: { messages: { orderBy: { createdAt: "asc" } }, order: { select: { ref: true } } },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return NextResponse.json({ tickets: rows.map(rowToTicket), total, take, skip });
}
