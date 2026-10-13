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

    const notification = await notify(
      req,
      author,
      updated.customerEmail,
      ticket.subject,
      message.value,
      ticket.id,
    );

    /* Le sort de la notification voyage avec la réponse.
     *
     * L'écran du back-office affichait « Réponse envoyée » dès le 201, alors
     * que l'email pouvait avoir été refusé par Resend sans que personne ne le
     * sache : le restaurant croyait avoir répondu, le client n'avait rien reçu,
     * et la réclamation vieillissait en silence. La forme du ticket est
     * conservée telle quelle — un champ s'ajoute, rien ne bouge. */
    return NextResponse.json({ ...rowToTicket(updated), notification }, { status: 201 });
  } catch {
    return serverError("Le message n'a pas pu être enregistré.");
  }
}

/* Ce que l'écran a besoin de savoir de la notification : est-elle partie, et à
 * qui. Le type n'est pas exporté — un fichier de route n'expose que ses
 * gestionnaires ; c'est `components/admin/SavAdmin.tsx` qui déclare la forme
 * qu'il lit. */
interface NotificationEnvoi {
  sent: boolean;
  to: string | null;
}

/**
 * Notifie la partie qui n'a pas écrit. Un échec d'email n'annule jamais le
 * message : il est déjà en base et visible dans le fil.
 *
 * En revanche il ne se tait plus. Le `catch {}` d'origine avalait tout, et
 * `sendTicketReply` était typée `Promise<void>` : le refus de Resend — que
 * `send()` rend pourtant en clair et journalise dans `EmailLog` — était jeté
 * deux fois. La fonction rend maintenant le verdict, pour que l'écran dise la
 * vérité à celle qui vient de taper sa réponse.
 */
async function notify(
  req: Request,
  author: "ADMIN" | "CLIENT",
  customerEmail: string,
  subject: string,
  body: string,
  ticketId: string,
): Promise<NotificationEnvoi> {
  const origin = originOf(req);

  /* Une réponse du restaurant va au client ; un message du client va au
   * restaurant, s'il a une adresse de notification. */
  const to = author === "ADMIN" ? customerEmail : (process.env.RESTAURANT_NOTIFY_EMAIL ?? null);
  if (!to) return { sent: false, to: null };

  const url =
    author === "ADMIN"
      ? `${origin}/compte?reclamation=${ticketId}`
      : `${origin}/admin/sav?ticket=${ticketId}`;

  /* `sendTicketReply` ne lève pas : elle rend `false` et journalise l'échec,
   * refus de Resend comme erreur de gabarit. Plus rien à rattraper ici. */
  const sent = await sendTicketReply(to, subject, body, url);
  if (!sent) {
    console.error(`[sav] réponse ${ticketId} enregistrée, mais l'email à ${to} n'est pas parti.`);
  }
  return { sent, to };
}
