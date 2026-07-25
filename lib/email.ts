import { Resend } from "resend";
import { rowToOrder } from "@/lib/serialize";
import { fmtPrice } from "@/lib/menu";
import { STATUS_LABEL } from "@/lib/types";

const isConfigured = () =>
  !!process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes("placeholder");

const resend = () => new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "commandes@o3saveurs.fr";

/* eslint-disable @typescript-eslint/no-explicit-any */
function orderHtml(row: any): string {
  const o = rowToOrder(row);
  const lines = o.lines
    .map(
      (l) =>
        `<tr><td style="padding:4px 0">${l.qty}× ${l.name}${
          l.formule ? ` <em style="color:#888">(${l.formule})</em>` : ""
        }</td><td style="text-align:right">${fmtPrice(l.unitPrice * l.qty)}</td></tr>`,
    )
    .join("");
  const modeLabel = o.mode === "livraison" ? "Livraison" : "À emporter";
  const addr =
    o.mode === "livraison" && o.customer.address
      ? `<p>Livraison : ${o.customer.address}, ${o.customer.zip ?? ""} ${o.customer.city ?? ""}</p>`
      : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#2a2018">
    <h2 style="color:#c0392b">Ô 3 Saveurs — Chez Laila</h2>
    <p>Merci ${o.customer.name} ! Votre commande <strong>${o.ref}</strong> est confirmée.</p>
    <p>Mode : <strong>${modeLabel}</strong> · Créneau : ${o.slot === "asap" ? "Dès que possible" : o.slot}</p>
    ${addr}
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${lines}
      <tr><td style="padding-top:8px">Sous-total</td><td style="text-align:right;padding-top:8px">${fmtPrice(o.subtotal)}</td></tr>
      ${o.fee ? `<tr><td>Frais de livraison</td><td style="text-align:right">${fmtPrice(o.fee)}</td></tr>` : ""}
      <tr><td style="font-weight:bold;padding-top:8px">Total ${o.paid ? "(payé)" : ""}</td><td style="text-align:right;font-weight:bold;padding-top:8px">${fmtPrice(o.total)}</td></tr>
    </table>
    <p>Statut : ${STATUS_LABEL[o.status] ?? o.status}</p>
    <p style="color:#888;font-size:13px">Un souci ? Répondez à cet email ou appelez le restaurant.</p>
  </div>`;
}

/** Email de confirmation au client + notification à la restauratrice. */
export async function sendOrderConfirmation(row: any): Promise<void> {
  if (!isConfigured()) {
    console.log(`[email] Resend non configuré — email de ${row.ref} non envoyé (dev).`);
    return;
  }
  const o = rowToOrder(row);
  const html = orderHtml(row);
  const client = resend();
  try {
    await client.emails.send({
      from: FROM,
      to: o.customer.email,
      subject: `Votre commande ${o.ref} est confirmée — Ô 3 Saveurs`,
      html,
    });
    const notify = process.env.RESTAURANT_NOTIFY_EMAIL;
    if (notify) {
      await client.emails.send({
        from: FROM,
        to: notify,
        subject: `Nouvelle commande ${o.ref} (${fmtPrice(o.total)})`,
        html,
      });
    }
  } catch (err) {
    console.error("Envoi email échoué:", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
