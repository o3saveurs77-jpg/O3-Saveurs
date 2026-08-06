/* Purge des données personnelles arrivées au terme de leur conservation.
 *
 * Pendant du fichier `lib/retention.ts`, qui porte les durées et explique
 * pourquoi une commande facturée ne suit pas la même règle qu'une commande
 * abandonnée. Cette route ne décide de rien : elle applique.
 *
 * Déclenchée une fois par jour depuis GitHub Actions
 * (`.github/workflows/retention.yml`), comme la relance de panier — le plan
 * Vercel Hobby limite les Cron Jobs intégrés et le projet a déjà fait ce choix.
 *
 * Elle est **idempotente** : relancée dix fois dans la journée, elle ne
 * détruit rien de plus. Les commandes déjà anonymisées sont exclues par leur
 * email vide, les suppressions portent sur des seuils de date.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ANONYMIZED_ORDER, retentionCutoffs } from "@/lib/retention";

export const dynamic = "force-dynamic";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

/** GET /api/cron/retention — protégé par le même secret partagé que les autres crons. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) return unauthorized();

  const c = retentionCutoffs(new Date());

  try {
    /* Commandes : anonymisation, jamais suppression. Le `customerEmail: { not: "" }`
       évite de réécrire à chaque passage des lignes déjà traitées. */
    const orders = await prisma.order.updateMany({
      where: {
        customerEmail: { not: "" },
        OR: [
          { invoiceNumber: null, createdAt: { lt: c.order } },
          { invoiceNumber: { not: null }, createdAt: { lt: c.invoicedOrder } },
        ],
      },
      data: { ...ANONYMIZED_ORDER },
    });

    const contactMessages = await prisma.contactMessage.deleteMany({
      where: { createdAt: { lt: c.contactMessage } },
    });

    // Décompté depuis le dernier échange (`updatedAt`), pas depuis la demande :
    // un devis relancé six mois plus tard redémarre le délai.
    const cateringInquiries = await prisma.cateringInquiry.deleteMany({
      where: { updatedAt: { lt: c.cateringInquiry } },
    });

    // Seules les réclamations closes sont purgées : un dossier resté ouvert
    // trois ans est une anomalie à traiter, pas une donnée à effacer.
    const supportTickets = await prisma.supportTicket.deleteMany({
      where: { closedAt: { not: null, lt: c.supportTicket } },
    });

    const unconfirmed = await prisma.newsletterSubscriber.deleteMany({
      where: { confirmed: false, createdAt: { lt: c.unconfirmedSubscriber } },
    });

    const unsubscribed = await prisma.newsletterSubscriber.deleteMany({
      where: { unsubscribedAt: { not: null, lt: c.unsubscribedSubscriber } },
    });

    const emailLogs = await prisma.emailLog.deleteMany({
      where: { sentAt: { lt: c.emailLog } },
    });

    const report = {
      ordersAnonymized: orders.count,
      contactMessagesDeleted: contactMessages.count,
      cateringInquiriesDeleted: cateringInquiries.count,
      supportTicketsDeleted: supportTickets.count,
      unconfirmedSubscribersDeleted: unconfirmed.count,
      unsubscribedSubscribersDeleted: unsubscribed.count,
      emailLogsDeleted: emailLogs.count,
    };

    // Tracé dans les logs de la plateforme : sans cela, prouver que la purge
    // tourne réellement supposerait de fouiller la base.
    console.info("[cron/retention]", JSON.stringify(report));

    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error("[cron/retention] échec:", error);
    return NextResponse.json({ error: "Purge impossible" }, { status: 500 });
  }
}
