/* Newsletter — inscription en double opt-in et statistiques d'administration.
 *
 * Deux principes gouvernent ce fichier :
 *
 *  · **Double opt-in (RGPD, art. 7).** L'inscription ne vaut consentement
 *    qu'après le clic dans l'email de confirmation. `confirmed` reste faux
 *    jusque-là, et aucune campagne ne part vers une adresse non confirmée.
 *
 *  · **Réponse neutre.** `POST` répond exactement la même chose que l'adresse
 *    soit nouvelle, déjà inscrite, en attente ou désinscrite. Distinguer ces
 *    cas transformerait la route en oracle d'énumération : n'importe qui
 *    pourrait tester une liste d'adresses et savoir lesquelles sont clientes.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, serverError } from "@/lib/guard";
import { collect, email as emailField, str, oneOf } from "@/lib/validate";
import { makeToken } from "@/lib/ref";
import { sendNewsletterConfirmation } from "@/lib/email";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const SOURCES = ["footer", "checkout", "admin", "import"] as const;

/** Message unique renvoyé par `POST`, quel que soit l'état réel de l'adresse. */
const NEUTRAL =
  "Merci ! Si cette adresse peut être inscrite, un email de confirmation vient de vous être envoyé.";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

interface Body {
  email?: unknown;
  name?: unknown;
  source?: unknown;
}

/** Origine absolue, pour les liens cliquables des emails. */
function originOf(req: Request): string {
  return (
    req.headers.get("origin") || process.env.NEXTAUTH_URL || new URL(req.url).origin
  );
}

/**
 * POST /api/newsletter — inscription publique.
 *
 * Réactive proprement une adresse désinscrite : nouveau jeton, `confirmed`
 * remis à faux, `unsubscribedAt` effacé. Une désinscription suivie d'une
 * ré-inscription redemande donc bien le consentement.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    email: emailField(body.email),
    name: str(body.name, "Le prénom", { max: 80, required: false }),
    source: oneOf(body.source ?? "footer", SOURCES, "La source"),
  });
  if (!fields.ok) return badRequest(fields.error);

  const { email, name, source } = fields.value;

  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

    // Nouvelle adresse : création + email de confirmation.
    if (!existing) {
      const token = makeToken();
      await prisma.newsletterSubscriber.create({
        data: { email, name: name || null, token, source },
      });
      await sendNewsletterConfirmation(email, `${originOf(req)}/api/newsletter/confirm?token=${token}`);
      return NextResponse.json({ ok: true, message: NEUTRAL });
    }

    // Adresse désinscrite : on repart d'un consentement neuf.
    if (existing.unsubscribedAt) {
      const token = makeToken();
      await prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: {
          token,
          confirmed: false,
          confirmedAt: null,
          unsubscribedAt: null,
          name: name || existing.name,
          source,
        },
      });
      await sendNewsletterConfirmation(email, `${originOf(req)}/api/newsletter/confirm?token=${token}`);
      return NextResponse.json({ ok: true, message: NEUTRAL });
    }

    // En attente de confirmation : on relance avec le même jeton. L'envoi est
    // dédupliqué en base par `lib/email.ts`, ce qui évite d'en faire un moyen
    // de harcèlement par email.
    if (!existing.confirmed) {
      await sendNewsletterConfirmation(
        email,
        `${originOf(req)}/api/newsletter/confirm?token=${existing.token}`,
      );
      return NextResponse.json({ ok: true, message: NEUTRAL });
    }

    // Déjà confirmée : rien à faire, et surtout rien à révéler.
    return NextResponse.json({ ok: true, message: NEUTRAL });
  } catch {
    return serverError("L'inscription n'a pas pu être enregistrée.");
  }
}

/**
 * GET /api/newsletter — **administration uniquement** : liste et statistiques.
 *
 * Le jeton de chaque inscrit n'est jamais renvoyé : il vaut désinscription en
 * un clic, il n'a rien à faire dans une réponse consultée depuis un navigateur.
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

  const where: Prisma.NewsletterSubscriberWhereInput = {};
  const status = url.searchParams.get("status");
  if (status === "confirmed") Object.assign(where, { confirmed: true, unsubscribedAt: null });
  if (status === "pending") Object.assign(where, { confirmed: false, unsubscribedAt: null });
  if (status === "unsubscribed") Object.assign(where, { unsubscribedAt: { not: null } });

  const search = url.searchParams.get("q");
  if (search) where.email = { contains: search.toLowerCase() };

  // Fenêtre d'évolution : les douze derniers mois entamés.
  const since = new Date();
  since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);

  const [rows, total, confirmed, pending, unsubscribed, recent] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        email: true,
        name: true,
        confirmed: true,
        confirmedAt: true,
        unsubscribedAt: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({ where: { confirmed: true, unsubscribedAt: null } }),
    prisma.newsletterSubscriber.count({ where: { confirmed: false, unsubscribedAt: null } }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: { not: null } } }),
    prisma.newsletterSubscriber.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, unsubscribedAt: true },
    }),
  ]);

  // Évolution mensuelle : inscriptions et désinscriptions par mois.
  const months: { month: string; subscribed: number; unsubscribed: number }[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < 12; i++) {
    months.push({
      month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      subscribed: 0,
      unsubscribed: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  for (const row of recent) {
    const inMonth = months.find((m) => m.month === key(row.createdAt));
    if (inMonth) inMonth.subscribed++;
    if (row.unsubscribedAt) {
      const outMonth = months.find((m) => m.month === key(row.unsubscribedAt as Date));
      if (outMonth) outMonth.unsubscribed++;
    }
  }

  return NextResponse.json({
    subscribers: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      confirmed: r.confirmed,
      confirmedAt: r.confirmedAt ? r.confirmedAt.getTime() : null,
      unsubscribedAt: r.unsubscribedAt ? r.unsubscribedAt.getTime() : null,
      source: r.source,
      createdAt: r.createdAt.getTime(),
    })),
    total,
    take,
    skip,
    stats: { confirmed, pending, unsubscribed, months },
  });
}
