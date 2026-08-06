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
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { rowToOrder } from "@/lib/serialize";
import { fmtCents, vatBreakdown, fmtVatRate, formatInvoiceNumber } from "@/lib/money";
import { escapeHtml } from "@/lib/validate";
import { STATUS_LABEL } from "@/lib/types";
import { getSettings } from "@/lib/settings";
import { sellerFromSettings } from "@/lib/invoice";
import { renderInvoicePdf } from "@/lib/pdf/renderInvoicePdf";
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
  const slot = order.slot === "asap" ? "Dès que possible" : order.slot;
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

  await send({
    to: order.customer.email,
    subject: `${order.ref} — ${STATUS_LABEL[order.status]} — Ô 3 Saveurs`,
    html: layout(
      STATUS_LABEL[order.status],
      `<p style="margin:0 0 12px">${escapeHtml(message)}</p>${orderSummary(order)}`,
    ),
    kind: "statut",
    orderId: order.id,
    // Une seule notification par étape, même si le statut est remis deux fois.
    dedupeKey: `statut:${order.id}:${order.status}`,
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
