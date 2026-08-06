import { renderToBuffer } from "@react-pdf/renderer";
import type { Order } from "@/lib/types";
import type { InvoiceSeller } from "@/lib/invoice";
import { InvoiceDocument } from "./invoiceDocument";

/** Génère le PDF de la facture — utilisé par la route de téléchargement et par l'email. */
export async function renderInvoicePdf(order: Order, seller: InvoiceSeller): Promise<Buffer> {
  return renderToBuffer(InvoiceDocument({ order, seller }));
}
