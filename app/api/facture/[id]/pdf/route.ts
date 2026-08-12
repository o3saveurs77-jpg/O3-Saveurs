/* Téléchargement PDF d'une facture — mêmes règles d'accès que `/facture/[id]`
 * (page HTML) : propriétaire de la commande ou administrateur, sinon 404 et
 * non 403 pour ne pas confirmer l'existence de la commande.
 */

import { prisma } from "@/lib/prisma";
import { canAccess, optionalUser, notFound } from "@/lib/guard";
import { rowToOrder } from "@/lib/serialize";
import { getSettings } from "@/lib/settings";
import { sellerFromSettings } from "@/lib/invoice";
import { formatInvoiceNumber } from "@/lib/money";
import { renderInvoicePdf } from "@/lib/pdf/renderInvoicePdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await optionalUser();
  if (!user) return notFound();

  const row = await prisma.order.findUnique({ where: { id } });
  if (!row) return notFound();
  if (!canAccess(user, row.customerEmail)) return notFound();

  const order = rowToOrder(row);
  const settings = await getSettings();
  const pdf = await renderInvoicePdf(order, sellerFromSettings(settings));

  const number = formatInvoiceNumber(order.invoiceNumber, new Date(order.createdAt));
  const filename = `${number === "—" ? order.ref : number}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
