/* Identité du vendeur portée sur une facture — partagée entre la page HTML
 * (`InvoiceClient`), la génération PDF (`lib/pdf/invoiceDocument.tsx`) et
 * l'email de facture, pour que les trois affichent toujours la même chose.
 */

import type { Settings } from "@/lib/settings";
/* `lib/address` et non `lib/settings` : ce module est chargé par la page de
 * facture, qui tourne dans le navigateur. `lib/settings` ouvre Prisma et tire
 * `lib/geo.ts`, marqué `server-only` — la compilation s'arrêtait dessus. Le
 * type `Settings` reste importé d'origine : un `import type` est effacé à la
 * compilation, il n'entraîne rien dans le bundle. */
import { formatAddress } from "@/lib/address";

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
  capital: string;
  rcs: string;
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
    capital: settings["legal.capital"],
    rcs: settings["legal.rcs"],
  };
}

/**
 * Forme, capital et immatriculation sur une ligne : « SASU · Capital de
 * 500,00 € · RCS Melun 131 135 550 ». Une société doit les porter sur ses
 * factures (art. R123-237 et R123-238 du code de commerce) ; les morceaux vides
 * sont omis, pour qu'une entreprise individuelle n'affiche pas « Capital de ».
 */
export function sellerLegalLine(seller: InvoiceSeller): string {
  return [
    seller.legalForm.trim(),
    seller.capital.trim() ? `Capital de ${seller.capital.trim()}` : "",
    seller.rcs.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ── Régularité du document ───────────────────────────────────────────────
 *
 * `legal.company`, `legal.legalForm` et `legal.siret` sont vides en base, et
 * des factures ont déjà été émises : la page comme le PDF sortaient un
 * document titré « FACTURE », numéroté dans la séquence comptable, portant
 * « SIRET : à compléter ». L'avertissement existait bien dans
 * `InvoiceClient`, mais réservé à l'administration et jamais imprimé : le
 * client, lui, recevait une facture irrégulière au regard de l'art. 242
 * nonies A du CGI sans que rien ne le signale.
 *
 * La règle est donc redescendue au niveau de l'identité réellement portée par
 * le document, et non des réglages : les trois rendus — HTML, PDF téléchargé,
 * PDF joint à l'email — la dérivent du même `InvoiceSeller` et ne peuvent plus
 * diverger. Tant que les mentions manquent, la pièce ne se présente pas comme
 * une facture.
 *
 * Choix retenu : **marquer**, et non refuser. Refuser le document priverait de
 * tout justificatif un client qui a payé, pour une faute qui n'est pas la
 * sienne ; et réécrire les quatre factures déjà émises est interdit (une
 * facture émise ne se modifie pas). Un justificatif explicite laisse au client
 * sa preuve d'achat, et au restaurant la possibilité d'émettre la pièce
 * régulière dès les réglages complétés.
 */

/** Même règle que `legalComplete()` de `lib/settings.ts`, appliquée au bloc
 *  vendeur tel qu'il sera imprimé. */
export function missingLegalMentions(seller: InvoiceSeller): string[] {
  const manquantes: string[] = [];
  if (!seller.company.trim()) manquantes.push("la dénomination sociale");
  if (!seller.legalForm.trim()) manquantes.push("la forme juridique");
  if (!seller.siret.trim()) manquantes.push("le SIRET");
  return manquantes;
}

/** Vrai quand le document peut se présenter comme une pièce comptable régulière. */
export function sellerLegalComplete(seller: InvoiceSeller): boolean {
  return missingLegalMentions(seller).length === 0;
}

export interface InvoiceHeading {
  /** Faux quand les mentions obligatoires manquent. */
  valid: boolean;
  /** Titre porté en haut du document. */
  title: string;
  /** Nom de la pièce dans une phrase, au masculin ou au féminin selon le mot. */
  noun: string;
  /** Avertissement **imprimé sur le document** — vide quand il est régulier. */
  notice: string;
  /** Base du nom de fichier proposé au téléchargement. */
  filenamePrefix: string;
}

/** « la dénomination sociale, la forme juridique et le SIRET ». */
function enumerate(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/**
 * Titre et avertissement du document, dérivés de la seule identité du vendeur.
 *
 * Un avoir incomplet subit le même sort qu'une facture incomplète : il porte
 * les mêmes mentions obligatoires, et le présenter comme un avoir régulier
 * serait le même faux.
 */
export function invoiceHeading(seller: InvoiceSeller, creditNote = false): InvoiceHeading {
  const manquantes = missingLegalMentions(seller);
  if (manquantes.length === 0) {
    return {
      valid: true,
      title: creditNote ? "AVOIR" : "FACTURE",
      noun: creditNote ? "avoir" : "facture",
      notice: "",
      filenamePrefix: creditNote ? "avoir" : "facture",
    };
  }

  const piece = creditNote ? "avoir" : "facture";
  const verbe = manquantes.length > 1 ? "manquent" : "manque";
  return {
    valid: false,
    title: creditNote ? "JUSTIFICATIF DE REMBOURSEMENT" : "JUSTIFICATIF DE COMMANDE",
    noun: "justificatif",
    notice:
      `Ce document ne vaut pas ${piece} : ${enumerate(manquantes)} du vendeur ${verbe} ` +
      `(art. 242 nonies A du CGI). Il atteste la commande et la somme en jeu ; ` +
      `la pièce en règle vous sera transmise dès ces mentions complétées.`,
    filenamePrefix: "justificatif",
  };
}

/** Phrase de règlement en pied de document — elle ne doit pas affirmer
 *  « facture acquittée » sur une pièce qui n'est pas une facture. */
export function settlementLine(heading: InvoiceHeading, paid: boolean): string {
  if (!heading.valid) {
    return paid
      ? "Somme réglée — aucun règlement complémentaire n'est dû."
      : "Somme non réglée à ce jour. Règlement à la remise de la commande.";
  }
  return paid
    ? "Facture acquittée — aucun règlement complémentaire n'est dû."
    : "Facture non acquittée à ce jour. Règlement à la remise de la commande.";
}
