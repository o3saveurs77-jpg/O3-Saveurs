/* Relance des paniers dont le paiement Stripe n'a pas été finalisé.
 *
 * `sendAbandonedCartReminder` (lib/email.ts) existait déjà mais n'était
 * appelée nulle part : la relance n'a de sens que **dans les 30 minutes**
 * suivant la commande, délai au bout duquel `expires_at` (app/api/checkout)
 * périme la session Stripe — le webhook (`checkout.session.expired`) annule
 * alors la commande et rend le stock. Passé ce délai, il n'y a plus rien à
 * relancer.
 *
 * Le projet est hébergé sur un plan Vercel Hobby, où les Cron Jobs intégrés
 * ne peuvent s'exécuter qu'une fois par jour — incompatible avec une fenêtre
 * de 30 minutes. Cette route est donc déclenchée depuis l'extérieur (GitHub
 * Actions, toutes les 10 minutes, voir .github/workflows/abandoned-carts.yml)
 * plutôt que par `vercel.json`. Elle reste réutilisable par n'importe quel
 * déclencheur externe capable d'envoyer l'en-tête `Authorization`.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { sendAbandonedCartReminder } from "@/lib/email";

export const dynamic = "force-dynamic";

// Fenêtre de relance : assez tôt pour que le client ait le temps de finir son
// paiement avant l'expiration à 30 min, jamais avant 10 min pour laisser le
// temps à un paiement en cours d'aboutir normalement.
const MIN_AGE_MINUTES = 10;
const MAX_AGE_MINUTES = 25;
const BATCH_LIMIT = 100;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

/** GET /api/cron/abandoned-carts — protégé par un secret partagé, pas par une session. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) return unauthorized();

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0, message: "Stripe non configuré" });
  }

  const now = Date.now();
  const candidates = await prisma.order.findMany({
    where: {
      status: "en_attente_paiement",
      paid: false,
      stripeSessionId: { not: null },
      createdAt: {
        gte: new Date(now - MAX_AGE_MINUTES * 60_000),
        lte: new Date(now - MIN_AGE_MINUTES * 60_000),
      },
    },
    take: BATCH_LIMIT,
  });

  let sent = 0;
  let skipped = 0;

  for (const order of candidates) {
    try {
      // La session peut avoir été payée ou avoir expiré entre la requête
      // ci-dessus et cet appel : on ne relance que si elle est encore ouverte,
      // et avec son URL réelle plutôt qu'un lien reconstruit à la main.
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId!);
      if (session.status !== "open" || !session.url) {
        skipped++;
        continue;
      }
      await sendAbandonedCartReminder(order, session.url);
      sent++;
    } catch (error) {
      console.error(`[cron/abandoned-carts] commande ${order.id} échouée:`, error);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, checked: candidates.length, sent, skipped });
}
