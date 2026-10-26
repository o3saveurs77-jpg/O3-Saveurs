/* Service traiteur — demandes de devis publiques.
 *
 * Même schéma que `/api/contact` : le message est d'abord enregistré
 * (`CateringInquiry`), pour ne rien perdre si l'email de notification échoue,
 * puis le restaurant et le client sont prévenus. Tout ce qui vient du
 * visiteur passe par `escapeHtml` avant d'entrer dans un email.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, badRequest, serverError, requireAdmin } from "@/lib/guard";
import { collect, str, email as emailField, phone as phoneField, oneOf, int, isoDate } from "@/lib/validate";
import { sendCateringInquiryReceived, sendCateringInquiryNotify } from "@/lib/email";
import { rowToCateringInquiry } from "@/lib/serialize";
import { CATERING_EVENT_TYPES, CATERING_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** GET /api/traiteur — file des demandes de devis (ADMIN). */
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
  const where = status && (CATERING_STATUSES as readonly string[]).includes(status) ? { status } : {};

  const [rows, total] = await Promise.all([
    prisma.cateringInquiry.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    prisma.cateringInquiry.count({ where }),
  ]);

  return NextResponse.json({ inquiries: rows.map(rowToCateringInquiry), total, take, skip });
}

interface Body {
  eventType?: unknown;
  eventDate?: unknown;
  guestCount?: unknown;
  location?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  message?: unknown;
}

/** POST /api/traiteur — enregistre la demande de devis et notifie les deux parties. */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    eventType: oneOf(body.eventType, CATERING_EVENT_TYPES, "Le type d'événement"),
    eventDate: isoDate(body.eventDate, "La date"),
    location: str(body.location, "Le lieu", { min: 2, max: 200 }),
    customerName: str(body.customerName, "Le nom", { min: 2, max: 80 }),
    customerPhone: phoneField(body.customerPhone),
    customerEmail: emailField(body.customerEmail),
    message: str(body.message, "Le message", { max: 2000, required: false }),
  });
  if (!fields.ok) return badRequest(fields.error);

  let guestCount: number | null = null;
  if (body.guestCount !== undefined && body.guestCount !== null && body.guestCount !== "") {
    const parsed = int(body.guestCount, "Le nombre de convives", { min: 1, max: 2000 });
    if (!parsed.ok) return badRequest(parsed.error);
    guestCount = parsed.value;
  }

  const { eventType, eventDate, location, customerName, customerPhone, customerEmail, message } =
    fields.value;

  let created;
  try {
    created = await prisma.cateringInquiry.create({
      data: {
        eventType,
        eventDate,
        guestCount,
        location,
        customerName,
        customerPhone,
        customerEmail,
        message,
      },
    });
  } catch {
    return serverError("Votre demande n'a pas pu être enregistrée. Merci de nous appeler.");
  }

  /* Ces deux `.catch(() => {})` avalaient tout, exceptions comme refus de
   * Resend. C'est ainsi qu'une demande de devis arrivée en base le 6 août à
   * 16 h 47 n'a laissé **aucune** trace dans `EmailLog` — ni succès, ni échec —
   * alors que le code d'envoi était en place depuis 13 h 12 le même jour.
   * Personne n'a été prévenu, et personne n'a pu s'en apercevoir.
   *
   * Les deux fonctions ne lèvent plus et rendent leur verdict ; `lib/email.ts`
   * journalise désormais jusqu'aux erreurs de gabarit. */
  const acknowledged = await sendCateringInquiryReceived(created);
  const notified = await sendCateringInquiryNotify(created);
  if (!notified) {
    console.error(
      `[traiteur] demande ${created.id} enregistrée, mais le restaurant n'a pas été prévenu par email.`,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      notified,
      acknowledged,
      /* Un devis se chiffre à la main : la personne attend un retour. Lui
       * promettre un email de confirmation qui n'est pas parti, c'est la
       * laisser attendre en silence — autant lui dire d'appeler. */
      message: acknowledged
        ? "Merci ! Votre demande de devis est bien arrivée, réponse sous 24 h ouvrées."
        : "Merci ! Votre demande de devis est bien arrivée — mais l'email de confirmation n'a pas pu vous être envoyé. Appelez-nous pour en parler tout de suite.",
    },
    { status: 201 },
  );
}
