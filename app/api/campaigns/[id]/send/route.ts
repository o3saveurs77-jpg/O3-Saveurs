/* Envoi d'une campagne de newsletter.
 *
 * Trois exigences, dans cet ordre de priorité :
 *
 *  1. **Ne jamais écrire à quelqu'un qui n'a pas consenti.** Seules les adresses
 *     `confirmed: true` et `unsubscribedAt: null` sont retenues. Le lien de
 *     désinscription est fourni à `sendCampaign()` pour chaque destinataire :
 *     il est obligatoire dans toute prospection (RGPD art. 21, LCEN art. L34-5).
 *
 *  2. **Idempotence.** Un double clic sur « Envoyer », ou deux onglets ouverts,
 *     ne doivent pas expédier la campagne deux fois. La campagne est
 *     *réservée* par un `updateMany` conditionné à `sentAt: null` — une seule
 *     requête concurrente peut gagner, la seconde repart en 409. La réservation
 *     précède l'envoi : mieux vaut une campagne marquée envoyée à tort après un
 *     crash qu'une campagne expédiée deux fois à toute la liste.
 *
 *  3. **Envoi par lots.** Les destinataires sont traités par paquets pour ne
 *     pas ouvrir des centaines de connexions simultanées vers Resend.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, notFound, conflict, badRequest } from "@/lib/guard";
import { sendCampaign } from "@/lib/email";

export const dynamic = "force-dynamic";
/** Un envoi de masse peut être long : on laisse de la marge à la fonction. */
export const maxDuration = 300;

/** Destinataires traités simultanément. */
const BATCH = 20;

/** Un client est « actif » s'il a commandé dans les 90 derniers jours. */
const ACTIVE_WINDOW_DAYS = 90;

interface Body {
  /** true = n'envoie qu'à l'administrateur connecté, sans rien consommer. */
  test?: unknown;
}

function originOf(req: Request): string {
  return req.headers.get("origin") || process.env.NEXTAUTH_URL || new URL(req.url).origin;
}

/** POST /api/campaigns/[id]/send */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = (await readJson<Body>(req)) ?? {};
  const isTest = body.test === true;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return notFound("Campagne introuvable");

  const origin = originOf(req);

  // ─── Envoi test : l'administrateur connecté, et personne d'autre ───
  if (isTest) {
    const ok = await sendCampaign(
      guard.user.email,
      `[TEST] ${campaign.subject}`,
      campaign.html,
      `${origin}/newsletter/desinscription`,
    );
    return NextResponse.json({
      ok,
      test: true,
      sentCount: ok ? 1 : 0,
      failedCount: ok ? 0 : 1,
      message: ok
        ? `Email de test envoyé à ${guard.user.email}.`
        : "Le test n'a pas pu être envoyé (Resend est-il configuré ?).",
    });
  }

  // ─── Idempotence ───
  if (campaign.sentAt) {
    return conflict(
      `Cette campagne a déjà été envoyée le ${campaign.sentAt.toLocaleDateString("fr-FR")} ` +
        `à ${campaign.sentCount} destinataire(s). Dupliquez-la pour envoyer un nouveau message.`,
    );
  }

  // ─── Audience ───
  const recipients = await audienceOf(campaign.audience);
  if (recipients.length === 0) {
    return badRequest(
      "Aucun destinataire dans cette audience : personne n'a confirmé son inscription, ou tous se sont désinscrits.",
    );
  }

  // Réservation atomique : `sentAt: null` dans le `where` fait la course pour
  // nous. `count === 0` signifie qu'une autre requête est déjà passée.
  const claim = await prisma.campaign.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: new Date(), status: "envoyee" },
  });
  if (claim.count === 0) {
    return conflict("Cette campagne est déjà en cours d'envoi ou vient d'être envoyée.");
  }

  // ─── Envoi par lots ───
  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((r) =>
        sendCampaign(
          r.email,
          campaign.subject,
          campaign.html,
          `${origin}/api/newsletter/unsubscribe?token=${encodeURIComponent(r.token)}`,
        ),
      ),
    );
    for (const ok of results) {
      if (ok) sentCount++;
      else failedCount++;
    }
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      sentCount,
      failedCount,
      // Zéro envoi réussi n'est pas un envoi : le statut le dit franchement.
      status: sentCount === 0 ? "echec" : "envoyee",
    },
  });

  return NextResponse.json({
    ok: sentCount > 0,
    test: false,
    total: recipients.length,
    sentCount,
    failedCount,
    message: `${sentCount} email(s) envoyé(s)${failedCount ? `, ${failedCount} en échec` : ""}.`,
  });
}

/**
 * Destinataires d'une audience. Le jeton accompagne l'adresse : c'est lui qui
 * rend le lien de désinscription valable en un clic, sans connexion.
 */
async function audienceOf(audience: string): Promise<{ email: string; token: string }[]> {
  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { confirmed: true, unsubscribedAt: null },
    select: { email: true, token: true },
  });

  if (audience !== "actifs" && audience !== "inactifs") return subscribers;

  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: "annulee" } },
    select: { customerEmail: true },
    distinct: ["customerEmail"],
  });
  const active = new Set(recent.map((o) => o.customerEmail.toLowerCase()));

  return audience === "actifs"
    ? subscribers.filter((s) => active.has(s.email.toLowerCase()))
    : subscribers.filter((s) => !active.has(s.email.toLowerCase()));
}
