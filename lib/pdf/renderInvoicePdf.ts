import { renderToBuffer } from "@react-pdf/renderer";
import type { Order } from "@/lib/types";
import type { InvoiceSeller } from "@/lib/invoice";
import { InvoiceDocument, type CreditNote } from "./invoiceDocument";

/** Génère le PDF de la facture — utilisé par la route de téléchargement et par l'email. */
export async function renderInvoicePdf(order: Order, seller: InvoiceSeller): Promise<Buffer> {
  return renderToBuffer(InvoiceDocument({ order, seller }));
}

/**
 * Génère le PDF d'un avoir. Même gabarit que la facture, à dessein : le client
 * doit reconnaître au premier coup d'œil la pièce qu'on lui rembourse.
 */
export async function renderCreditNotePdf(
  order: Order,
  seller: InvoiceSeller,
  creditNote: CreditNote,
): Promise<Buffer> {
  return renderToBuffer(InvoiceDocument({ order, seller, creditNote }));
}
