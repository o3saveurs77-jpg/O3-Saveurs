/* Téléchargement PDF d'une facture — mêmes règles d'accès que `/facture/[id]`
 * (page HTML) : propriétaire de la commande ou administrateur, sinon 404 et
 * non 403 pour ne pas confirmer l'existence de la commande.
 *
 * Cette route ne vérifiait pas les mentions obligatoires : tant que la
 * dénomination, la forme juridique et le SIRET manquent en réglages — ce qui
 * est le cas en base — elle servait un PDF titré « FACTURE », numéroté dans la
 * séquence comptable et nommé `FA-2026-000004.pdf`, portant « SIRET : à
 * compléter ». Le document lui-même se présente désormais pour ce qu'il est
 * (`invoiceHeading`, voir `lib/invoice.ts`) et le nom du fichier téléchargé
 * dit la même chose : un justificatif ne doit pas arriver chez le comptable du
 * client sous le nom d'une facture.
 */

import { prisma } from "@/lib/prisma";
import { canAccess, optionalUser, notFound } from "@/lib/guard";
import { rowToOrder } from "@/lib/serialize";
import { getSettings } from "@/lib/settings";
import { invoiceHeading, sellerFromSettings } from "@/lib/invoice";
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
  const seller = sellerFromSettings(settings);
  const pdf = await renderInvoicePdf(order, seller);

  const heading = invoiceHeading(seller);
  const number = formatInvoiceNumber(order.invoiceNumber, new Date(order.createdAt));
  const filename = heading.valid
    ? `${number === "—" ? order.ref : number}.pdf`
    : `${heading.filenamePrefix}-${order.ref}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
