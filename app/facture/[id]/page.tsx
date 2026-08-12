/* Facture d'une commande.
 *
 * Cette page lisait la commande dans la liste complète chargée par un contexte
 * client (`OrdersProvider`, monté dans le layout racine) : changer l'identifiant
 * dans l'URL affichait la facture nominative de n'importe quel client, adresse
 * de livraison comprise (audit §2.2).
 *
 * Elle est désormais un Server Component : la commande est chargée en base et
 * l'autorisation vérifiée avant tout rendu. Un accès illégitime renvoie une
 * **404 et non une 403**, qui confirmerait l'existence de la commande.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccess, optionalUser } from "@/lib/guard";
import { rowToOrder } from "@/lib/serialize";
import { getSettings, legalComplete } from "@/lib/settings";
import { sellerFromSettings } from "@/lib/invoice";
import { InvoiceClient } from "@/components/invoice/InvoiceClient";

export const dynamic = "force-dynamic";

/** Données personnelles : cette page ne doit jamais être indexée. */
export const metadata: Metadata = {
  title: "Facture · Ô 3 Saveurs — Chez Laila",
  robots: { index: false, follow: false },
};

export default async function FacturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await optionalUser();
  if (!user) notFound();

  const row = await prisma.order.findUnique({ where: { id } });
  if (!row) notFound();

  // Propriétaire de la commande ou administrateur, rien d'autre.
  if (!canAccess(user, row.customerEmail)) notFound();

  const settings = await getSettings();

  return (
    <InvoiceClient
      order={rowToOrder(row)}
      seller={sellerFromSettings(settings)}
      isAdmin={user.role === "ADMIN"}
      legalOk={legalComplete(settings)}
      pdfUrl={`/api/facture/${id}/pdf`}
    />
  );
}
