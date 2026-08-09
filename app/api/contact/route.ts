/* Formulaire de contact public.
 *
 * Distinct du SAV : pas de commande, pas de fil de discussion, pas de compte.
 * Le message est enregistré (`ContactMessage`) pour ne rien perdre si l'email
 * de notification échoue, puis le restaurant est prévenu.
 *
 * Tout ce qui vient du visiteur passe par `escapeHtml` avant d'entrer dans le
 * corps de l'email : sans cela, un « nom » contenant un lien produit un email
 * de phishing expédié depuis le domaine du restaurant vers la boîte de Laila.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, badRequest, serverError, requireAdmin } from "@/lib/guard";
import { collect, str, email as emailField, phone as phoneField, escapeHtml } from "@/lib/validate";
import { send, sendContactReceived } from "@/lib/email";
import { rowToContactMessage } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/contact — file des messages du formulaire de contact (ADMIN).
 *
 * Avant cette route, un message n'existait que dans la base et dans la boîte
 * mail de notification : si l'email était raté ou supprimé, plus personne côté
 * restaurant ne pouvait savoir qu'un visiteur avait écrit.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const take = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("take")) || PAGE_SIZE),
  );
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);

  const status = url.searchParams.get("status");
  const where = status === "traites" ? { handled: true } : status === "a_traiter" ? { handled: false } : {};

  const [rows, total] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.contactMessage.count({ where }),
  ]);

  return NextResponse.json({ messages: rows.map(rowToContactMessage), total, take, skip });
}

interface Body {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
}

/** POST /api/contact — enregistre le message et notifie le restaurant. */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    name: str(body.name, "Le nom", { min: 2, max: 80 }),
    email: emailField(body.email),
    phone: phoneField(body.phone, { required: false }),
    subject: str(body.subject, "L'objet", { max: 150, required: false }),
    message: str(body.message, "Le message", { min: 10, max: 4000 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const { name, email, phone, subject, message } = fields.value;

  let created;
  try {
    created = await prisma.contactMessage.create({
      data: {
        name,
        email,
        phone: phone || null,
        subject,
        message,
      },
    });
  } catch {
    return serverError("Votre message n'a pas pu être enregistré. Merci de nous appeler.");
  }

  // La notification est secondaire : le message est déjà en base, un échec
  // d'envoi ne doit pas faire croire au visiteur qu'il a écrit dans le vide.
  const notifyTo = process.env.RESTAURANT_NOTIFY_EMAIL;
  if (notifyTo) {
    await send({
      to: notifyTo,
      subject: `Message du site — ${subject || "sans objet"}`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#2c1d11">
          <h3 style="margin:0 0 12px">Nouveau message depuis le formulaire de contact</h3>
          <p style="margin:0 0 4px"><strong>${escapeHtml(name)}</strong></p>
          <p style="margin:0 0 4px">Email : ${escapeHtml(email)}</p>
          ${phone ? `<p style="margin:0 0 4px">Téléphone : ${escapeHtml(phone)}</p>` : ""}
          ${subject ? `<p style="margin:0 0 12px">Objet : ${escapeHtml(subject)}</p>` : ""}
          <p style="margin:12px 0 0;white-space:pre-wrap">${escapeHtml(message)}</p>
        </div>`,
      kind: "sav",
      dedupeKey: `contact:${created.id}`,
    }).catch(() => {});
  }

  /* Accusé de réception à l'expéditeur : sans lui, il ne savait pas si son
   * message était parti, et beaucoup réécrivaient ou appelaient dans le doute. */
  await sendContactReceived({
    id: created.id,
    name,
    email,
    subject,
    message,
  }).catch(() => {});

  return NextResponse.json(
    {
      ok: true,
      message: "Merci ! Votre message est bien arrivé, nous vous répondons au plus vite.",
    },
    { status: 201 },
  );
}
