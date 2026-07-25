/* Campagnes de newsletter — liste et création (administration uniquement). */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, serverError } from "@/lib/guard";
import { collect, str, oneOf, isoDate } from "@/lib/validate";

export const dynamic = "force-dynamic";

const AUDIENCES = ["tous", "actifs", "inactifs"] as const;

interface Body {
  subject?: unknown;
  html?: unknown;
  audience?: unknown;
  scheduledAt?: unknown;
}

/** GET /api/campaigns — historique des campagnes, la plus récente d'abord. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rows = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  // Taille de l'audience joignable, pour annoncer un volume avant l'envoi.
  const reachable = await prisma.newsletterSubscriber.count({
    where: { confirmed: true, unsubscribedAt: null },
  });

  return NextResponse.json({
    campaigns: rows.map((c) => ({
      id: c.id,
      subject: c.subject,
      html: c.html,
      audience: c.audience,
      status: c.status,
      scheduledAt: c.scheduledAt ? c.scheduledAt.getTime() : null,
      sentAt: c.sentAt ? c.sentAt.getTime() : null,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      createdAt: c.createdAt.getTime(),
    })),
    total: rows.length,
    reachable,
  });
}

/** POST /api/campaigns — nouvelle campagne, toujours créée en brouillon. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    subject: str(body.subject, "L'objet", { min: 3, max: 150 }),
    html: str(body.html, "Le contenu", { min: 10, max: 50_000 }),
    audience: oneOf(body.audience ?? "tous", AUDIENCES, "L'audience"),
    scheduledAt: isoDate(body.scheduledAt, "La date d'envoi"),
  });
  if (!fields.ok) return badRequest(fields.error);

  try {
    const created = await prisma.campaign.create({
      data: {
        subject: fields.value.subject,
        html: fields.value.html,
        audience: fields.value.audience,
        scheduledAt: fields.value.scheduledAt,
        // Le statut n'est jamais fourni par le client : une campagne ne peut
        // pas naître « envoyée ».
        status: fields.value.scheduledAt ? "programmee" : "brouillon",
      },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch {
    return serverError("La campagne n'a pas pu être créée.");
  }
}
