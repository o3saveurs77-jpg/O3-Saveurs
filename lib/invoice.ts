/* Identité du vendeur portée sur une facture — partagée entre la page HTML
 * (`InvoiceClient`), la génération PDF (`lib/pdf/invoiceDocument.tsx`) et
 * l'email de facture, pour que les trois affichent toujours la même chose.
 */

import type { Settings } from "@/lib/settings";
import { formatAddress } from "@/lib/settings";

export interface InvoiceSeller {
  name: string;
  tagline: string;
  company: string;
  legalForm: string;
  address: string;
  phone: string;
  email: string;
  siret: string;
  vatNumber: string;
}

export function sellerFromSettings(settings: Settings): InvoiceSeller {
  return {
    name: settings["restaurant.name"],
    tagline: settings["restaurant.tagline"],
    company: settings["legal.company"],
    legalForm: settings["legal.legalForm"],
    address: formatAddress(settings),
    phone: settings["restaurant.phone"],
    email: settings["restaurant.email"],
    siret: settings["legal.siret"],
    vatNumber: settings["legal.vatNumber"],
  };
}
