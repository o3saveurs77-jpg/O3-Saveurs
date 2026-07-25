/* Fil de discussion d'une réclamation.
 *
 * **`author` est déterminé par la session, jamais par le corps de la requête.**
 * Le faire confiance au client permettrait à n'importe quel réclamant de poster
 * un message signé « ADMIN » : « nous vous avons remboursé », « votre dossier
 * est clos ». Le champ est donc calculé à partir du rôle, et un `author` envoyé
 * dans le JSON est purement et simplement ignoré.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToTicket } from "@/lib/serialize";
import {
  requireUser,
  canAccess,
  readJson,
  badRequest,
  notFound,
  serverError,
} from "@/lib/guard";
import { str } from "@/lib/validate";
import { sendTicketReply } from "@/lib/email";

export const dynamic = "force-dynamic";

interface Body {
  body?: unknown;
}

function originOf(req: Request): string {
  return req.headers.get("origin") || process.env.NEXTAUTH_URL || new URL(req.url).origin;
}

/** POST /api/tickets/[id]/messages — répond dans le fil et notifie l'autre partie. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const payload = await readJson<Body>(req);
  if (!payload) return badRequest("Requête invalide");

  const message = str(payload.body, "Le message", { min: 2, max: 4000 });
  if (!message.ok) return badRequest(message.error);

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  // Réclamation d'un tiers : 404, jamais 403.
  if (!ticket || !canAccess(guard.user, ticket.customerEmail)) {
    return notFound("Réclamation introuvable");
  }

  const author = guard.user.role === "ADMIN" ? "ADMIN" : "CLIENT";

  try {
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, author, body: message.value },
    });

    // Une réponse du restaurant fait passer la réclamation « en cours » : la
    // file de traitement doit refléter ce qui a réellement été pris en charge.
    const nextStatus =
      author === "ADMIN" && ticket.status === "ouvert" ? "en_cours" : ticket.status;

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      // L'écriture remonte `updatedAt` (`@updatedAt`), ce qui remet la
      // réclamation en tête de la file triée par dernière activité.
      data: { status: nextStatus },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        order: { select: { ref: true } },
      },
    });

    await notify(req, author, updated.customerEmail, ticket.subject, message.value, ticket.id);

    return NextResponse.json(rowToTicket(updated), { status: 201 });
  } catch {
    return serverError("Le message n'a pas pu être enregistré.");
  }
}

/**
 * Notifie la partie qui n'a pas écrit. Un échec d'email n'annule jamais le
 * message : il est déjà en base et visible dans le fil.
 */
async function notify(
  req: Request,
  author: "ADMIN" | "CLIENT",
  customerEmail: string,
  subject: string,
  body: string,
  ticketId: string,
): Promise<void> {
  const origin = originOf(req);
  try {
    if (author === "ADMIN") {
      await sendTicketReply(customerEmail, subject, body, `${origin}/compte?reclamation=${ticketId}`);
      return;
    }
    const notifyTo = process.env.RESTAURANT_NOTIFY_EMAIL;
    if (notifyTo) {
      await sendTicketReply(notifyTo, subject, body, `${origin}/admin/sav?ticket=${ticketId}`);
    }
  } catch {
    /* l'email est un accessoire, le message reste enregistré */
  }
}
