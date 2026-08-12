/* Envoi d'emails (Resend).
 *
 * Trois corrections par rapport à la version précédente :
 *
 *  · **Échappement HTML.** Le nom du client et les libellés de plats étaient
 *    interpolés directement dans le template. Un client dont le nom contenait
 *    un lien obtenait un email de phishing envoyé depuis le domaine du
 *    restaurant vers la boîte de Laila. Tout passe désormais par `escapeHtml`.
 *
 *  · **Idempotence.** Stripe rejoue un webhook en cas de timeout : le client
 *    recevait alors plusieurs confirmations. Chaque envoi porte une
 *    `dedupeKey` unique en base ; un second envoi est simplement ignoré.
 *
 *  · **Un template par étape** du cycle de vie, au lieu d'un seul email de
 *    confirmation réutilisé pour tout.
 *
 * ── Qui reçoit quoi, et quand ───────────────────────────────────────────────
 *
 * Commande, côté client :
 *   commande enregistrée ......... sendOrderConfirmation   (checkout)
 *   paiement encaissé ............ sendPaymentReceived     (webhook Stripe)
 *   paiement refusé / expiré ..... sendPaymentFailed       (webhook Stripe)
 *   en cuisine / en route /
 *     livrée / annulée ........... sendStatusUpdate        (chaque changement)
 *     — « en route » porte le code de remise à donner au livreur
 *   facture ...................... sendInvoice             (encaissement, carte ou espèces)
 *   avoir ........................ sendCreditNote          (remboursement)
 *   annulation refusée ........... sendCancelDeclined      (décision du restaurant)
 *   panier abandonné ............. sendAbandonedCartReminder (tâche planifiée)
 *
 * Plat sur commande (gigot, agneau entier…), côté client :
 *   payée, en attente d'accord ... sendPreorderPending     (remplace sendPaymentReceived)
 *   acceptée ..................... sendPreorderAccepted
 *   refusée ...................... sendPreorderRefused     (+ avoir, sendCreditNote)
 *
 * Commande, côté restaurant (RESTAURANT_NOTIFY_EMAIL) :
 *   nouvelle commande ............ sendOrderConfirmation
 *   paiement encaissé ............ sendPaymentReceived
 *   commande à valider ........... sendPreorderPending
 *   annulation demandée .......... sendCancelRequest
 *   incident de livraison ........ sendDriverIncident      (signalé depuis la rue)
 *
 * Hors commande :
 *   newsletter ................... sendNewsletterConfirmation, sendCampaign
 *   message de contact ........... sendContactReceived (expéditeur) + notification
 *   réclamation .................. sendTicketOpened (client + restaurant), sendTicketReply
 *   devis traiteur ............... sendCateringInquiryReceived, sendCateringInquiryNotify
 *
 * Les changements d'étape ne sont **pas** notifiés au restaurant : c'est lui
 * qui les provoque depuis le back-office. Il n'est alerté que de ce qu'il ne
 * peut pas voir venir — une commande qui tombe, un paiement, une demande
 * d'annulation.
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { fmtCents, vatBreakdown, fmtVatRate, formatInvoiceNumber } from "@/lib/money";
import { formatCreditNoteNumber } from "@/lib/refunds";
import { formatPreorderSchedule } from "@/lib/preorder";
import { escapeHtml } from "@/lib/validate";
import { STATUS_LABEL } from "@/lib/types";
import { getSettings } from "@/lib/settings";
import { sellerFromSettings } from "@/lib/invoice";
import { renderInvoicePdf, renderCreditNotePdf } from "@/lib/pdf/renderInvoicePdf";
import type { Order as OrderRow, CateringInquiry } from "@prisma/client";

const isConfigured = () =>
  !!process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes("placeholder");

const client = () => new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "commandes@o3saveurs.fr";
const NOTIFY = process.env.RESTAURANT_NOTIFY_EMAIL;

export type EmailKind =
  | "confirmation"
  | "paiement"
  | "statut"
  | "facture"
  | "avoir"
  | "annulation"
  | "relance"
  | "newsletter"
  | "sav"
  | "traiteur";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  kind: EmailKind;
  orderId?: string;
  /** Clé d'unicité métier, ex. `paiement:<orderId>`. Si l'envoi a déjà eu lieu, on n'insiste pas. */
  dedupeKey?: string;
  attachments?: { filename: string; content: Buffer }[];
}

/**
 * Envoi unitaire, journalisé. Ne lève jamais : un email qui échoue ne doit pas
 * faire échouer un paiement ou une commande.
 */
export async function send({
  to,
  subject,
  html,
  kind,
  orderId,
  dedupeKey,
  attachments,
}: SendArgs): Promise<boolean> {
  if (dedupeKey) {
    const already = await prisma.emailLog.findUnique({ where: { dedupeKey } });
    if (already) return false;
  }

  if (!isConfigured()) {
    console.log(`[email] Resend non configuré — « ${subject} » non envoyé à ${to} (dev).`);
    return false;
  }

  try {
    await client().emails.send({ from: FROM, to, subject, html, attachments });
    await prisma.emailLog.create({
      data: { kind, orderId: orderId ?? null, to, dedupeKey: dedupeKey ?? null, ok: true },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";
    console.error(`[email] échec « ${subject} » → ${to} : ${message}`);
    await prisma.emailLog
      .create({
        data: {
          kind,
          orderId: orderId ?? null,
          to,
          dedupeKey: dedupeKey ?? null,
          ok: false,
          error: message,
        },
      })
      .catch(() => {});
    return false;
  }
}

// ─── Gabarit commun ────────────────────────────────────────────

function layout(title: string, body: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#2c1d11;background:#f7e9d2;padding:24px;border-radius:16px">
    <h2 style="margin:0 0 4px;color:#a6243a">Ô 3 Saveurs <span style="font-weight:400">— Chez Laila</span></h2>
    <p style="margin:0 0 20px;color:#856a50;font-size:13px">Cuisine du monde · Pontault-Combault</p>
    <div style="background:#fff;padding:20px;border-radius:12px">
      <h3 style="margin:0 0 14px;font-size:17px">${escapeHtml(title)}</h3>
      ${body}
    </div>
    <p style="margin:18px 0 0;color:#856a50;font-size:12px;text-align:center">
      Une question ? Répondez à cet email ou appelez-nous.
    </p>
  </div>`;
}

function linesTable(order: ReturnType<typeof rowToOrder>): string {
  const rows = order.lines
    .map((l) => {
      const detail = l.formule || Object.values(l.opts).join(", ");
      return `<tr>
        <td style="padding:5px 0;vertical-align:top">
          ${l.qty}× ${escapeHtml(l.name)}
          ${detail ? `<br><span style="color:#856a50;font-size:12px">${escapeHtml(detail)}</span>` : ""}
        </td>
        <td style="text-align:right;vertical-align:top;white-space:nowrap">${fmtCents(l.lineTotalCents)}</td>
      </tr>`;
    })
    .join("");

  const discount =
    order.discountCents > 0
      ? `<tr><td style="color:#1fa89a">Remise${order.promoCode ? ` (${escapeHtml(order.promoCode)})` : ""}</td>
         <td style="text-align:right;color:#1fa89a">− ${fmtCents(order.discountCents)}</td></tr>`
      : "";

  const fee =
    order.feeCents > 0
      ? `<tr><td>Frais de livraison</td><td style="text-align:right">${fmtCents(order.feeCents)}</td></tr>`
      : "";

  return `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">
    ${rows}
    <tr><td colspan="2" style="border-top:1px solid #e7d3b0;padding-top:8px"></td></tr>
    <tr><td>Sous-total</td><td style="text-align:right">${fmtCents(order.subtotalCents)}</td></tr>
    ${discount}
    ${fee}
    <tr>
      <td style="font-weight:bold;padding-top:6px">Total</td>
      <td style="text-align:right;font-weight:bold;padding-top:6px">${fmtCents(order.totalCents)}</td>
    </tr>
  </table>`;
}

function orderSummary(order: ReturnType<typeof rowToOrder>): string {
  const mode = order.mode === "livraison" ? "Livraison" : "À emporter";
  /* Une commande sur commande porte une date, pas une heure : « 19:30 » tout
   * seul laisserait croire à ce soir, alors que le gigot est pour jeudi. */
  const slot = order.scheduledFor
    ? formatPreorderSchedule(new Date(order.scheduledFor))
    : order.slot === "asap"
      ? "Dès que possible"
      : order.slot;
  const addr =
    order.mode === "livraison" && order.customer.address
      ? `<p style="margin:4px 0;color:#856a50;font-size:13px">${escapeHtml(order.customer.address)}, ${escapeHtml(order.customer.zip ?? "")} ${escapeHtml(order.customer.city ?? "")}</p>`
      : "";

  return `
    <p style="margin:0 0 2px"><strong>${escapeHtml(order.ref)}</strong> · ${mode} · ${escapeHtml(slot)}</p>
    ${addr}
    ${linesTable(order)}`;
}

// ─── Emails du cycle de commande ───────────────────────────────

/** Commande enregistrée (paiement en espèces, ou en attente de règlement carte). */
export async function sendOrderConfirmation(row: OrderRow): Promise<void> {
  const order = rowToOrder(row);
  const pending = !order.paid;

  const html = layout(
    `Merci ${order.customer.name}, votre commande est enregistrée !`,
    orderSummary(order) +
      (pending
        ? `<p style="margin:0;padding:10px;background:#fce4cf;border-radius:8px;font-size:13px">
             Montant à régler ${order.paymentMethod.toLowerCase().includes("espèce") ? "à la livraison ou au retrait" : "en ligne"} : <strong>${fmtCents(order.totalCents)}</strong>
           </p>`
        : `<p style="margin:0;color:#1fa89a;font-size:13px">Paiement reçu — merci !</p>`),
  );

  await send({
    to: order.customer.email,
    subject: `Votre commande ${order.ref} est enregistrée — Ô 3 Saveurs`,
    html,
    kind: "confirmation",
    orderId: order.id,
    dedupeKey: `confirmation:${order.id}`,
  });

  if (NOTIFY) {
    await send({
      to: NOTIFY,
      subject: `Nouvelle commande ${order.ref} · ${fmtCents(order.totalCents)}`,
      html: layout(
        `Nouvelle commande — ${order.customer.name}`,
        orderSummary(order) +
          `<p style="margin:0;font-size:13px">
             Téléphone : ${escapeHtml(order.customer.phone)}<br>
             Paiement : ${escapeHtml(order.paymentMethod)} — ${order.paid ? "payé" : "à encaisser"}
           </p>`,
      ),
      kind: "confirmation",
      orderId: order.id,
      dedupeKey: `confirmation-resto:${order.id}`,
    });
  }
}

/** Paiement confirmé par Stripe. Idempotent : un seul envoi, même si le webhook rejoue. */
export async function sendPaymentReceived(row: OrderRow): Promise<void> {
  const order = rowToOrder(row);
  const html = layout(
    "Paiement reçu — votre commande part en cuisine",
    orderSummary(order) +
      `<p style="margin:0;color:#1fa89a;font-size:13px">
         Nous avons bien reçu votre paiement de <strong>${fmtCents(order.totalCents)}</strong>.
       </p>`,
  );

  await send({
    to: order.customer.email,
    subject: `Paiement reçu pour la commande ${order.ref} — Ô 3 Saveurs`,
    html,
    kind: "paiement",
    orderId: order.id,
    dedupeKey: `paiement:${order.id}`,
  });

  if (NOTIFY) {
    await send({
      to: NOTIFY,
      subject: `✅ Payé — commande ${order.ref} · ${fmtCents(order.totalCents)}`,
      html,
      kind: "paiement",
      orderId: order.id,
      dedupeKey: `paiement-resto:${order.id}`,
    });
  }
}

// ─── Plats sur commande ────────────────────────────────────────

/**
 * Commande sur commande payée, en attente de l'accord du restaurant.
 *
 * Remplace `sendPaymentReceived` pour ces commandes-là : annoncer « votre
 * commande part en cuisine » alors qu'elle peut encore être refusée serait un
 * mensonge, et le client se présenterait le jeudi pour un gigot que personne
 * n'a lancé.
 */
export async function sendPreorderPending(row: OrderRow): Promise<void> {
  const order = rowToOrder(row);
  const quand = row.scheduledFor ? formatPreorderSchedule(row.scheduledFor) : "la date demandée";

  await send({
    to: order.customer.email,
    subject: `Votre réservation ${order.ref} nous est bien parvenue — Ô 3 Saveurs`,
    html: layout(
      "Nous avons reçu votre réservation",
      `<p style="margin:0 0 12px">
         Votre paiement de <strong>${fmtCents(order.totalCents)}</strong> est bien enregistré pour
         le <strong>${escapeHtml(quand)}</strong>.
       </p>
       <p style="margin:0 0 12px;padding:12px;background:#fce4cf;border-radius:8px;font-size:13px">
         Ces plats se préparent à l'avance et sur mesure : nous vous confirmons la commande
         par email dès que la cuisine a validé la date. Si nous ne pouvions pas l'honorer,
         vous seriez intégralement remboursé.
       </p>
       ${orderSummary(order)}`,
    ),
    kind: "confirmation",
    orderId: order.id,
    dedupeKey: `precommande-attente:${order.id}`,
  });

  if (NOTIFY) {
    await send({
      to: NOTIFY,
      subject: `⏳ À VALIDER — ${order.ref} pour le ${quand} · ${fmtCents(order.totalCents)}`,
      html: layout(
        `Commande à valider — ${order.customer.name}`,
        `<p style="margin:0 0 12px">
           Payée et en attente de votre accord pour le <strong>${escapeHtml(quand)}</strong>.
           Tant qu'elle n'est pas validée, elle n'apparaît pas dans le plan de cuisine.
         </p>
         ${orderSummary(order)}
         <p style="margin:0;font-size:13px">Téléphone : ${escapeHtml(order.customer.phone)}</p>`,
      ),
      kind: "confirmation",
      orderId: order.id,
      dedupeKey: `precommande-attente-resto:${order.id}`,
    });
  }
}

/** Le restaurant accepte : la date est tenue, la commande est ferme. */
export async function sendPreorderAccepted(row: OrderRow): Promise<void> {
  const order = rowToOrder(row);
  const quand = row.scheduledFor ? formatPreorderSchedule(row.scheduledFor) : "la date convenue";
  const retrait =
    order.mode === "livraison" ? "Nous vous livrons" : "Vous pourrez venir la chercher";

  await send({
    to: order.customer.email,
    subject: `C'est confirmé : ${order.ref} pour le ${quand} — Ô 3 Saveurs`,
    html: layout(
      "Votre commande est confirmée",
      `<p style="margin:0 0 12px">
         Bonne nouvelle : nous préparons votre commande pour le
         <strong>${escapeHtml(quand)}</strong>. ${retrait} à cette heure-là.
       </p>
       ${orderSummary(order)}`,
    ),
    kind: "statut",
    orderId: order.id,
    dedupeKey: `precommande-acceptee:${order.id}`,
  });
}

/**
 * Le restaurant refuse. L'email part **avant** l'avoir : le client doit
 * comprendre pourquoi son argent revient, sinon un remboursement sans
 * explication passe pour une erreur de banque.
 */
export async function sendPreorderRefused(row: OrderRow, reason: string): Promise<void> {
  const order = rowToOrder(row);
  const quand = row.scheduledFor ? formatPreorderSchedule(row.scheduledFor) : "la date demandée";
  const motif = reason.trim();

  await send({
    to: order.customer.email,
    subject: `Nous ne pouvons pas honorer la commande ${order.ref} — Ô 3 Saveurs`,
    html: layout(
      "Votre commande n'a pas pu être retenue",
      `<p style="margin:0 0 12px">
         Nous sommes désolés : nous ne pouvons pas préparer votre commande pour le
         <strong>${escapeHtml(quand)}</strong>.
       </p>
       ${
         motif
           ? `<p style="margin:0 0 12px;padding:12px;background:#fce4cf;border-radius:8px;font-size:13px">
                ${escapeHtml(motif)}
              </p>`
           : ""
       }
       <p style="margin:0 0 12px">
         <strong>${fmtCents(order.totalCents)}</strong> vous sont intégralement remboursés —
         comptez quelques jours pour que votre banque les affiche. Un avoir vous parvient
         séparément.
       </p>
       <p style="margin:0;font-size:13px;color:#856a50">
         Appelez-nous si vous souhaitez décaler la date : nous trouverons une solution.
       </p>
       ${orderSummary(order)}`,
    ),
    kind: "annulation",
    orderId: order.id,
    dedupeKey: `precommande-refusee:${order.id}`,
  });
}

/** Changement d'étape (en cuisine, en route, livrée, annulée). */
export async function sendStatusUpdate(row: OrderRow): Promise<void> {
  const order = rowToOrder(row);

  const messages: Partial<Record<string, string>> = {
    cuisine: "Votre commande est en préparation dans nos cuisines.",
    route: "Votre commande est en route ! Notre livreur arrive.",
    livree: "Votre commande a été livrée. Bon appétit !",
    annulee: "Votre commande a été annulée. Contactez-nous si vous avez une question.",
  };
  const message = messages[order.status];
  if (!message) return; // pas d'email pour les étapes internes

  /* Code de remise, sur le départ en livraison uniquement.
   *
   * Il part avec cet email et pas plus tôt : communiqué à la commande, il
   * serait enseveli sous les messages suivants au moment où le livreur le
   * demande. C'est aussi la preuve que la commande est bien remise à son
   * destinataire, et non déposée dans le hall d'un immeuble. */
  const code =
    order.status === "route" && row.deliveryCode
      ? `<p style="margin:0 0 14px;padding:14px;background:#fce4cf;border-radius:10px;text-align:center">
           <span style="display:block;font-size:13px;color:#856a50">Code à donner au livreur</span>
           <strong style="display:block;font-size:30px;letter-spacing:6px;color:#a6243a">${escapeHtml(row.deliveryCode)}</strong>
           <span style="display:block;font-size:12px;color:#856a50">Il vous le demandera à la remise de votre commande.</span>
         </p>`
      : "";

  await send({
    to: order.customer.email,
    subject:
      order.status === "route" && row.deliveryCode
        ? `${order.ref} — en route ! Votre code : ${row.deliveryCode} — Ô 3 Saveurs`
        : `${order.ref} — ${STATUS_LABEL[order.status]} — Ô 3 Saveurs`,
    html: layout(
      STATUS_LABEL[order.status],
      `<p style="margin:0 0 12px">${escapeHtml(message)}</p>${code}${orderSummary(order)}`,
    ),
    kind: "statut",
    orderId: order.id,
    // Une seule notification par étape, même si le statut est remis deux fois.
    dedupeKey: `statut:${order.id}:${order.status}`,
  });
}

/**
 * Demande d'annulation déposée par un client sur une commande déjà engagée.
 *
 * Part **au restaurant**, pas au client : c'est une décision qui attend un
 * humain. Sans cet email, la demande n'existait que dans l'écran des
 * commandes — invisible tant que personne ne pensait à l'ouvrir, alors que
 * les plats continuaient de cuire.
 */
export async function sendCancelRequest(row: OrderRow, orderUrl: string): Promise<void> {
  if (!NOTIFY) return;

  const order = rowToOrder(row);

  await send({
    to: NOTIFY,
    subject: `⚠ Annulation demandée — commande ${order.ref} (${STATUS_LABEL[order.status]})`,
    html: layout(
      `${order.customer.name} demande l'annulation de ${order.ref}`,
      `<p style="margin:0 0 12px;padding:10px;background:#fce4cf;border-radius:8px;font-size:13px">
         La commande est <strong>${escapeHtml(STATUS_LABEL[order.status])}</strong> :
         elle n'a pas été annulée. À vous de décider.
       </p>
       ${
         order.cancelReason
           ? `<p style="margin:0 0 12px"><strong>Motif :</strong> ${escapeHtml(order.cancelReason)}</p>`
           : `<p style="margin:0 0 12px;color:#856a50">Aucun motif précisé.</p>`
       }
       ${orderSummary(order)}
       <p style="margin:0 0 14px;font-size:13px">
         ${order.paid ? `Commande <strong>payée</strong> — un remboursement sera à émettre si vous acceptez.` : "Commande non encaissée."}
         <br>Téléphone : ${escapeHtml(order.customer.phone)}
       </p>
       <p style="margin:0"><a href="${escapeHtml(orderUrl)}" style="color:#e8732a;font-weight:bold">Ouvrir la commande</a></p>`,
    ),
    kind: "annulation",
    orderId: order.id,
    dedupeKey: `annulation-demande:${order.id}`,
  });
}

/**
 * Demande d'annulation refusée : la commande suit son cours.
 *
 * Le pendant du message ci-dessus. Sans lui, un client ayant demandé
 * l'annulation restait sans nouvelle et voyait arriver une commande qu'il
 * croyait annulée — la pire des surprises, et un litige assuré.
 */
export async function sendCancelDeclined(row: OrderRow, reason: string): Promise<void> {
  const order = rowToOrder(row);

  await send({
    to: order.customer.email,
    subject: `${order.ref} — votre commande est maintenue — Ô 3 Saveurs`,
    html: layout(
      "Votre commande est maintenue",
      `<p style="margin:0 0 12px">Nous avons bien reçu votre demande d'annulation, mais votre
         commande était déjà en préparation : nous ne pouvons plus l'arrêter.</p>
       ${reason ? `<p style="margin:0 0 12px">${escapeHtml(reason)}</p>` : ""}
       ${orderSummary(order)}
       <p style="margin:0;font-size:13px">Une question ? Répondez à cet email ou appelez-nous.</p>`,
    ),
    kind: "annulation",
    orderId: order.id,
    dedupeKey: `annulation-refus:${order.id}`,
  });
}

/**
 * Facture, envoyée une fois le paiement acquis. Le PDF est joint directement
 * à l'email (mêmes gabarit et données que `/facture/[id]`) : le lien reste en
 * repli pour le consulter ou le réimprimer en ligne.
 */
export async function sendInvoice(row: OrderRow, invoiceUrl: string): Promise<void> {
  const order = rowToOrder(row);
  const vat = vatBreakdown(order.totalCents, order.vatRateBp);
  const number = formatInvoiceNumber(order.invoiceNumber, new Date(order.createdAt));

  const html = layout(
    `Facture ${number}`,
    orderSummary(order) +
      `<table style="width:100%;font-size:13px;margin:0 0 14px">
         <tr><td>Total HT</td><td style="text-align:right">${fmtCents(vat.netCents)}</td></tr>
         <tr><td>TVA ${fmtVatRate(vat.rateBp)}</td><td style="text-align:right">${fmtCents(vat.vatCents)}</td></tr>
         <tr><td style="font-weight:bold">Total TTC</td><td style="text-align:right;font-weight:bold">${fmtCents(vat.grossCents)}</td></tr>
       </table>
       <p style="margin:0">Votre facture est jointe à cet email, au format PDF.
       Vous pouvez aussi <a href="${escapeHtml(invoiceUrl)}" style="color:#e8732a;font-weight:bold">la consulter en ligne</a>.</p>`,
  );

  const settings = await getSettings();
  const pdf = await renderInvoicePdf(order, sellerFromSettings(settings));

  await send({
    to: order.customer.email,
    subject: `Votre facture ${number} — Ô 3 Saveurs`,
    html,
    kind: "facture",
    orderId: order.id,
    dedupeKey: `facture:${order.id}`,
    attachments: [{ filename: `${number === "—" ? order.ref : number}.pdf`, content: pdf }],
  });
}

/**
 * Avoir, envoyé au moment où l'argent repart vers le client.
 *
 * Pièce distincte de la facture, qui reste valable : c'est ce que le client
 * doit comprendre en le lisant, et ce qu'un contrôle comptable attend. Le PDF
 * est joint, comme pour la facture.
 *
 * La clé de déduplication porte le cumul remboursé, et non l'identifiant seul :
 * deux remboursements partiels successifs sont deux avoirs à envoyer, pas un
 * doublon à taire.
 */
export async function sendCreditNote(
  row: OrderRow,
  amountCents: number,
  invoiceUrl: string,
): Promise<void> {
  const order = rowToOrder(row);
  const at = row.refundedAt ?? new Date();
  const number = formatCreditNoteNumber(order.creditNoteNumber, at);
  const facture = formatInvoiceNumber(order.invoiceNumber, new Date(order.createdAt));
  const restant = Math.max(0, order.totalCents - order.refundedCents);

  const html = layout(
    `Avoir ${number}`,
    `<p style="margin:0 0 14px">Nous avons remboursé votre commande
       <strong>${escapeHtml(order.ref)}</strong>.</p>
     <table style="width:100%;font-size:13px;margin:0 0 14px">
       <tr><td>Montant remboursé</td><td style="text-align:right;font-weight:bold">${fmtCents(amountCents)}</td></tr>
       <tr><td>Total de la commande</td><td style="text-align:right">${fmtCents(order.totalCents)}</td></tr>
       ${
         restant > 0
           ? `<tr><td>Reste acquis</td><td style="text-align:right">${fmtCents(restant)}</td></tr>`
           : ""
       }
     </table>
     ${
       order.refundReason
         ? `<p style="margin:0 0 14px">Motif : ${escapeHtml(order.refundReason)}</p>`
         : ""
     }
     <p style="margin:0 0 14px">Selon votre banque, le montant peut mettre quelques jours
       à réapparaître sur votre relevé.</p>
     <p style="margin:0">Votre avoir ${escapeHtml(number)} est joint à cet email. Il se rapporte à
       la facture ${escapeHtml(facture)}, qui reste valable —
       <a href="${escapeHtml(invoiceUrl)}" style="color:#e8732a;font-weight:bold">la consulter en ligne</a>.</p>`,
  );

  const settings = await getSettings();
  const pdf = await renderCreditNotePdf(order, sellerFromSettings(settings), {
    number,
    amountCents,
    totalRefundedCents: order.refundedCents,
    reason: order.refundReason,
    at,
  });

  await send({
    to: order.customer.email,
    subject: `Votre avoir ${number} — Ô 3 Saveurs`,
    html,
    kind: "avoir",
    orderId: order.id,
    dedupeKey: `avoir:${order.id}:${order.refundedCents}`,
    attachments: [{ filename: `${number === "—" ? order.ref : number}.pdf`, content: pdf }],
  });
}

/**
 * Paiement refusé ou session expirée.
 *
 * La commande est annulée et le stock rendu — mais le client, lui, n'en savait
 * rien : sa commande disparaissait en silence. Il attendait une livraison qui
 * ne viendrait jamais, ou refaisait sa commande sans comprendre. Le message
 * dit ce qui s'est passé et renvoie à la carte.
 */
export async function sendPaymentFailed(
  row: OrderRow,
  expired: boolean,
  menuUrl: string,
): Promise<void> {
  const order = rowToOrder(row);

  await send({
    to: order.customer.email,
    subject: `${order.ref} — paiement non abouti — Ô 3 Saveurs`,
    html: layout(
      expired ? "Votre paiement n'a pas été finalisé" : "Votre paiement a été refusé",
      `<p style="margin:0 0 12px">${
        expired
          ? "La page de paiement a expiré avant validation : votre commande n'a pas été enregistrée."
          : "Votre banque a refusé le paiement : votre commande n'a pas été enregistrée."
      }</p>
       <p style="margin:0 0 14px;padding:10px;background:#fce4cf;border-radius:8px;font-size:13px">
         <strong>Aucun montant n'a été débité.</strong> Les plats réservés ont été remis en vente.
       </p>
       ${orderSummary(order)}
       <p style="margin:0"><a href="${escapeHtml(menuUrl)}" style="color:#e8732a;font-weight:bold">Repasser commande</a>
       — ou appelez-nous, nous la prenons par téléphone.</p>`,
    ),
    kind: "paiement",
    orderId: order.id,
    dedupeKey: `paiement-echec:${order.id}`,
  });
}

/**
 * Accusé de réception d'un message envoyé depuis la page Contact.
 *
 * Le restaurant était prévenu, l'expéditeur non : il ne savait pas si son
 * message était parti, et beaucoup réécrivent ou appellent dans le doute.
 */
export async function sendContactReceived(msg: {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  await send({
    to: msg.email,
    subject: "Nous avons bien reçu votre message — Ô 3 Saveurs",
    html: layout(
      `Merci ${msg.name}, votre message est arrivé`,
      `<p style="margin:0 0 12px">Nous vous répondons dès que possible, en général sous 24 heures
         ouvrées.</p>
       ${msg.subject ? `<p style="margin:0 0 6px"><strong>Objet :</strong> ${escapeHtml(msg.subject)}</p>` : ""}
       <p style="margin:0 0 14px;padding:12px;background:#f7e9d2;border-radius:8px;white-space:pre-wrap;font-size:13px">${escapeHtml(msg.message)}</p>
       <p style="margin:0;font-size:13px">Besoin d'une réponse immédiate ? Appelez-nous.</p>`,
    ),
    kind: "sav",
    dedupeKey: `contact-accuse:${msg.id}`,
  });
}

/**
 * Incident signalé par le livreur depuis la rue.
 *
 * Va **au restaurant** : client absent, adresse introuvable, commande refusée.
 * Sans cet email, le signalement dormait dans une colonne de la base que
 * personne ne regarde pendant un service.
 */
export async function sendDriverIncident(row: OrderRow, note: string): Promise<void> {
  if (!NOTIFY) return;

  const order = rowToOrder(row);

  await send({
    to: NOTIFY,
    subject: `⚠ Problème de livraison — ${order.ref} (${order.customer.name})`,
    html: layout(
      `Le livreur signale un problème sur ${order.ref}`,
      `<p style="margin:0 0 12px;padding:12px;background:#fce4cf;border-radius:8px;white-space:pre-wrap">${escapeHtml(note)}</p>
       <p style="margin:0 0 12px;font-size:13px">
         ${escapeHtml(order.customer.name)} — ${escapeHtml(order.customer.phone)}<br>
         ${escapeHtml(order.customer.address ?? "")} ${escapeHtml(order.customer.zip ?? "")} ${escapeHtml(order.customer.city ?? "")}
       </p>
       ${orderSummary(order)}`,
    ),
    kind: "statut",
    orderId: order.id,
    /* La clé porte l'horodatage du signalement : un second incident sur la
     * même commande est une nouvelle information, pas un doublon. */
    dedupeKey: `incident:${order.id}:${row.incidentAt?.getTime() ?? 0}`,
  });
}

/** Relance d'un panier resté impayé (lot 6.6). */
export async function sendAbandonedCartReminder(row: OrderRow, checkoutUrl: string): Promise<void> {
  const order = rowToOrder(row);
  await send({
    to: order.customer.email,
    subject: `Votre commande ${order.ref} vous attend — Ô 3 Saveurs`,
    html: layout(
      "Votre commande n'a pas été réglée",
      orderSummary(order) +
        `<p style="margin:0"><a href="${escapeHtml(checkoutUrl)}" style="color:#e8732a;font-weight:bold">Reprendre ma commande</a></p>`,
    ),
    kind: "relance",
    orderId: order.id,
    dedupeKey: `relance:${order.id}`,
  });
}

// ─── Emails hors commande ──────────────────────────────────────

/** Double opt-in newsletter : rien n'est envoyé avant confirmation du clic. */
export async function sendNewsletterConfirmation(
  to: string,
  confirmUrl: string,
): Promise<void> {
  await send({
    to,
    subject: "Confirmez votre inscription — Ô 3 Saveurs",
    html: layout(
      "Une dernière étape",
      `<p style="margin:0 0 14px">Confirmez votre inscription pour recevoir nos nouveautés et nos offres.</p>
       <p style="margin:0 0 14px"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#e8732a;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Je confirme</a></p>
       <p style="margin:0;color:#856a50;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    ),
    kind: "newsletter",
    dedupeKey: `newsletter-optin:${to.toLowerCase()}`,
  });
}

/** Campagne newsletter, avec le lien de désinscription obligatoire. */
export async function sendCampaign(
  to: string,
  subject: string,
  bodyHtml: string,
  unsubscribeUrl: string,
): Promise<boolean> {
  return send({
    to,
    subject,
    html:
      layout(subject, bodyHtml) +
      `<p style="margin:12px 0 0;text-align:center;color:#856a50;font-size:11px">
         <a href="${escapeHtml(unsubscribeUrl)}" style="color:#856a50">Se désinscrire</a>
       </p>`,
    kind: "newsletter",
  });
}

/** Réponse à une réclamation. */
export async function sendTicketReply(
  to: string,
  ticketSubject: string,
  body: string,
  ticketUrl: string,
): Promise<void> {
  await send({
    to,
    subject: `Réponse à votre réclamation — ${ticketSubject}`,
    html: layout(
      ticketSubject,
      `<p style="margin:0 0 14px;white-space:pre-wrap">${escapeHtml(body)}</p>
       <p style="margin:0"><a href="${escapeHtml(ticketUrl)}" style="color:#e8732a;font-weight:bold">Voir la conversation</a></p>`,
    ),
    kind: "sav",
  });
}

/** Accusé de réception d'une réclamation + alerte au restaurant. */
export async function sendTicketOpened(
  to: string,
  ticketSubject: string,
  ticketId: string,
): Promise<void> {
  await send({
    to,
    subject: `Nous avons reçu votre réclamation — Ô 3 Saveurs`,
    html: layout(
      "Réclamation enregistrée",
      `<p style="margin:0 0 8px">Votre demande « ${escapeHtml(ticketSubject)} » a bien été enregistrée.</p>
       <p style="margin:0;color:#856a50;font-size:13px">Nous revenons vers vous au plus vite.</p>`,
    ),
    kind: "sav",
    dedupeKey: `sav-open:${ticketId}`,
  });

  if (NOTIFY) {
    await send({
      to: NOTIFY,
      subject: `🛎 Nouvelle réclamation — ${ticketSubject}`,
      html: layout("Nouvelle réclamation", `<p style="margin:0">${escapeHtml(ticketSubject)}</p>`),
      kind: "sav",
      dedupeKey: `sav-open-resto:${ticketId}`,
    });
  }
}

// ─── Traiteur ──────────────────────────────────────────────────

const CATERING_EVENT_LABEL: Record<string, string> = {
  bureau: "Réunion / séminaire de bureau",
  mariage: "Mariage & réception",
  autre: "Anniversaire, baptême ou autre réception",
};

const dateFmtLong = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

/** Accusé de réception d'une demande de devis traiteur. */
export async function sendCateringInquiryReceived(inquiry: CateringInquiry): Promise<void> {
  const eventLabel = CATERING_EVENT_LABEL[inquiry.eventType] ?? inquiry.eventType;
  await send({
    to: inquiry.customerEmail,
    subject: "Votre demande de devis traiteur — Ô 3 Saveurs",
    html: layout(
      `Merci ${escapeHtml(inquiry.customerName)}, votre demande est bien arrivée !`,
      `<p style="margin:0 0 8px"><strong>${escapeHtml(eventLabel)}</strong></p>
       <p style="margin:0 0 4px">Lieu : ${escapeHtml(inquiry.location)}</p>
       ${inquiry.eventDate ? `<p style="margin:0 0 4px">Date : ${dateFmtLong.format(inquiry.eventDate)}</p>` : ""}
       ${inquiry.guestCount ? `<p style="margin:0 0 4px">Convives : ${inquiry.guestCount}</p>` : ""}
       <p style="margin:12px 0 0;color:#856a50;font-size:13px">Nous revenons vers vous sous 24 h ouvrées avec un devis chiffré.</p>`,
    ),
    kind: "traiteur",
    dedupeKey: `traiteur-recu:${inquiry.id}`,
  });
}

/** Alerte au restaurant pour une nouvelle demande de devis traiteur. */
export async function sendCateringInquiryNotify(inquiry: CateringInquiry): Promise<void> {
  if (!NOTIFY) return;
  const eventLabel = CATERING_EVENT_LABEL[inquiry.eventType] ?? inquiry.eventType;
  await send({
    to: NOTIFY,
    subject: `💍 Nouvelle demande traiteur — ${eventLabel}`,
    html: layout(
      "Nouvelle demande de devis traiteur",
      `<p style="margin:0 0 4px"><strong>${escapeHtml(inquiry.customerName)}</strong></p>
       <p style="margin:0 0 4px">${escapeHtml(inquiry.customerPhone)} · ${escapeHtml(inquiry.customerEmail)}</p>
       <p style="margin:0 0 4px">${escapeHtml(eventLabel)}</p>
       <p style="margin:0 0 4px">Lieu : ${escapeHtml(inquiry.location)}</p>
       ${inquiry.eventDate ? `<p style="margin:0 0 4px">Date : ${dateFmtLong.format(inquiry.eventDate)}</p>` : ""}
       ${inquiry.guestCount ? `<p style="margin:0 0 4px">Convives : ${inquiry.guestCount}</p>` : ""}
       ${inquiry.message ? `<p style="margin:12px 0 0;white-space:pre-wrap">${escapeHtml(inquiry.message)}</p>` : ""}`,
    ),
    kind: "traiteur",
    dedupeKey: `traiteur-resto:${inquiry.id}`,
  });
}
