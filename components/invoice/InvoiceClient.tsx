"use client";

/* Facture — pièce comptable.
 *
 * Quatre défauts corrigés ici, tous relevés à l'audit §4.1 à §4.3 :
 *
 *  1. La mention « TVA non applicable, art. 293 B du CGI » avait été copiée du
 *     bloc de signature du développeur (auto-entrepreneur en franchise). Elle est
 *     fausse pour un restaurant : la vente à emporter et livrée relève de la TVA
 *     à 10 % (art. 279 m CGI). Le taux vient désormais de `order.vatRateBp`,
 *     figé à la commande depuis les réglages.
 *  2. Aucune ventilation HT / TVA / TTC, exigée par l'art. 242 nonies A du CGI.
 *  3. « Payé par X » était affiché sans jamais consulter `order.paid` : une
 *     commande en espèces non encaissée produisait une pièce comptable fausse.
 *  4. Le numéro dérivait de `ref`, tiré au hasard. Il vient maintenant du
 *     compteur séquentiel `order.invoiceNumber` (art. 242 nonies A CGI).
 *
 * Le document ne reçoit que des données déjà autorisées : la page parente est un
 * Server Component qui vérifie la propriété de la commande.
 */

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Emblem } from "@/components/Brand";
import { fmtCents, fmtVatRate, vatBreakdown } from "@/lib/money";
import { formatInvoiceNumber } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/types";
import type { Order } from "@/lib/types";

/** Identité du vendeur, lue dans les réglages par la page serveur. */
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

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Feuille de style d'impression dédiée.
 * Le bouton imprimait jusqu'ici toute la page (nav, pied de page, barre
 * d'actions). Tout est masqué sauf le document, sorti du flux pour occuper la
 * page seul — `app/globals.css` ne comporte aucune règle `@media print`.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #facture-doc, #facture-doc * { visibility: visible !important; }
  #facture-doc {
    position: absolute !important;
    left: 0; top: 0; width: 100%;
    margin: 0 !important; padding: 0 !important;
    border: 0 !important; box-shadow: none !important;
  }
  #facture-doc table { page-break-inside: auto; }
  #facture-doc tr { page-break-inside: avoid; }
}
`;

export function InvoiceClient({
  order,
  seller,
  isAdmin = false,
  legalOk = true,
}: {
  order: Order;
  seller: InvoiceSeller;
  /** Vue administration : les avertissements de conformité y sont affichés. */
  isAdmin?: boolean;
  /** `legalComplete()` — faux tant que les informations légales manquent. */
  legalOk?: boolean;
}) {
  const createdAt = new Date(order.createdAt);
  const vat = vatBreakdown(order.totalCents, order.vatRateBp);

  // Le numéro n'est attribué qu'à l'émission : une commande en attente de
  // paiement n'en a pas, et la séquence ne doit comporter aucun trou.
  const number = formatInvoiceNumber(order.invoiceNumber, createdAt);

  // Aucun champ `paidAt` en base : l'horodatage de confirmation est la date la
  // plus proche de l'encaissement dont on dispose.
  const paidAt = order.timeline.confirmedAt ?? order.createdAt;

  return (
    <div className="wrap max-w-2xl py-10">
      <style>{PRINT_CSS}</style>

      {/* barre d'actions — jamais imprimée */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={isAdmin ? "/admin/facturation" : "/compte"}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-2 hover:text-ink"
        >
          <Icon name="chevL" size={18} /> {isAdmin ? "Facturation" : "Mon compte"}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-white hover:brightness-105 sm:px-6"
        >
          <Icon name="print" size={18} />
          {/* Le libellé complet fait déborder la barre sous 400 px ; le geste
              reste le même, seul son intitulé se raccourcit. */}
          <span className="sm:hidden">Imprimer</span>
          <span className="hidden sm:inline">Imprimer / Enregistrer en PDF</span>
        </button>
      </div>

      {/* Avertissements de conformité — administration uniquement, jamais imprimés.
          Émettre une facture incomplète en silence est le risque à éviter. */}
      {isAdmin && (!legalOk || order.invoiceNumber === null || !order.paid) && (
        <div className="mb-5 space-y-2 print:hidden">
          {!legalOk && (
            <div className="flex items-start gap-3 rounded-xl border border-brick/40 bg-primary-soft p-4 text-brick">
              <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-bold">Informations légales incomplètes</p>
                <p className="mt-1">
                  Dénomination, forme juridique ou SIRET manquants : cette facture ne comporte pas
                  toutes les mentions obligatoires (art. 242 nonies A du CGI). À renseigner dans{" "}
                  <Link href="/admin/reglages" className="font-bold underline">
                    Réglages
                  </Link>{" "}
                  avant tout envoi au client ou au comptable.
                </p>
              </div>
            </div>
          )}
          {order.invoiceNumber === null && (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-panel-2 p-4 text-ink">
              <Icon name="warning" size={20} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-sm">
                <span className="font-bold">Numéro de facture non attribué.</span> Il l&apos;est à
                l&apos;encaissement, pour que la séquence reste chronologique et sans rupture. Ce
                document est un justificatif de commande, pas encore une facture.
              </p>
            </div>
          )}
          {!order.paid && (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-panel-2 p-4 text-ink">
              <Icon name="euro" size={20} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-sm">
                <span className="font-bold">Commande non encaissée</span> — paiement «{" "}
                {PAYMENT_STATUS_LABEL[order.paymentStatus]} ». Le document mentionne un reste à
                payer et non un paiement acquis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* document */}
      <article
        id="facture-doc"
        /* `p-8` ne laissait que 224 px de contenu sur un écran de 320 px : les
           lignes d'adresse et le tableau d'articles se cassaient mot par mot.
           La marge d'impression, elle, reste celle du document. */
        className="rounded-[var(--radius-card)] border border-line bg-white p-5 text-ink shadow-[var(--shadow-soft)] sm:p-8 print:p-8"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div className="flex min-w-0 items-center gap-3">
            <Emblem size={52} />
            <div className="text-sm text-ink-2">
              <p className="font-display text-xl text-ink">
                {seller.company || `${seller.name} — ${seller.tagline}`}
              </p>
              {seller.company && (
                <p className="text-ink">
                  {seller.name} — {seller.tagline}
                </p>
              )}
              {seller.legalForm && <p>{seller.legalForm}</p>}
              <p>{seller.address}</p>
              <p>
                {seller.phone}
                {seller.email ? ` · ${seller.email}` : ""}
              </p>
              <p className="mt-1">
                SIRET : {seller.siret || "à compléter"}
                {seller.vatNumber ? ` · TVA : ${seller.vatNumber}` : ""}
              </p>
            </div>
          </div>
          {/* `text-left` sous 640 px : aligné à droite sur une seule colonne,
              le bloc se retrouvait décalé sous le bloc vendeur sans rapport
              visuel avec lui. */}
          <div className="text-left sm:text-right">
            <h1 className="font-display text-2xl">FACTURE</h1>
            <p className="text-sm font-semibold">{number}</p>
            <p className="text-sm text-ink-2">Émise le {dateFmt.format(createdAt)}</p>
            <p className="text-sm text-ink-2">Commande {order.ref}</p>
          </div>
        </header>

        <section className="grid gap-4 py-6 text-sm sm:grid-cols-2">
          <div>
            <p className="font-bold text-ink-2">Facturé à</p>
            <p className="mt-1 font-semibold">{order.customer.name}</p>
            <p>{order.customer.email}</p>
            <p>{order.customer.phone}</p>
            {order.customer.address && (
              <p>
                {order.customer.address}, {order.customer.zip} {order.customer.city}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="font-bold text-ink-2">Prestation</p>
            <p className="mt-1 font-semibold">
              {order.mode === "livraison" ? "Livraison à domicile" : "Vente à emporter"}
            </p>
            <p>Créneau : {order.slot === "asap" ? "dès que possible" : order.slot}</p>
            {order.paid ? (
              <p className="font-semibold text-teal">
                Payé par {order.paymentMethod} le {dateTimeFmt.format(new Date(paidAt))}
              </p>
            ) : (
              <p className="font-semibold text-brick">
                Reste à payer : {fmtCents(order.totalCents)} ({order.paymentMethod})
              </p>
            )}
          </div>
        </section>

        {/* Quatre colonnes chiffrées ne tiennent pas sous ~420 px. Le tableau
            défile à l'écran ; `print:min-w-0` le rend à sa largeur naturelle sur
            le papier, où il n'y a rien à faire défiler. */}
        <div className="-mx-1 overflow-x-auto px-1 print:mx-0 print:overflow-visible print:px-0">
          <table className="w-full min-w-[26rem] text-sm print:min-w-0">
            <caption className="sr-only">Détail des articles facturés</caption>
            <thead>
              <tr className="border-y border-line text-left text-ink-2">
                <th scope="col" className="py-2 font-semibold">
                  Article
                </th>
                <th scope="col" className="py-2 text-center font-semibold">
                  Qté
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  P.U. TTC
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Total TTC
                </th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr
                  key={`${l.dishId}-${l.formule ?? ""}-${JSON.stringify(l.opts)}`}
                  className="border-b border-line"
                >
                  <td className="py-2.5">
                    {l.name}
                    {l.formule && <span className="block text-xs text-ink-2">{l.formule}</span>}
                    {Object.values(l.opts).length > 0 && (
                      <span className="block text-xs text-ink-2">
                        {Object.values(l.opts).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-center">{l.qty}</td>
                  <td className="py-2.5 text-right">{fmtCents(l.unitPriceCents)}</td>
                  <td className="py-2.5 text-right font-semibold">{fmtCents(l.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-2">Sous-total</span>
            <span>{fmtCents(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-2">
                Remise{order.promoCode ? ` (${order.promoCode})` : ""}
              </span>
              <span className="text-teal">-{fmtCents(order.discountCents)}</span>
            </div>
          )}
          {order.feeCents > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-2">Frais de livraison</span>
              <span>{fmtCents(order.feeCents)}</span>
            </div>
          )}

          {/* Ventilation obligatoire (art. 242 nonies A du CGI). */}
          <div className="mt-2 space-y-1.5 border-t border-line pt-2">
            <div className="flex justify-between">
              <span className="text-ink-2">Total HT</span>
              <span>{fmtCents(vat.netCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">TVA {fmtVatRate(order.vatRateBp)}</span>
              <span>{fmtCents(vat.vatCents)}</span>
            </div>
          </div>

          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <span>Total TTC</span>
            <span className="text-brick">{fmtCents(order.totalCents)}</span>
          </div>
        </div>

        <footer className="mt-8 space-y-1 border-t border-line pt-4 text-center text-xs text-ink-2">
          <p>
            Montants en euros. TVA au taux de {fmtVatRate(order.vatRateBp)} applicable à la vente de
            produits alimentaires à emporter ou livrés (art. 279 m du CGI).
          </p>
          <p>
            {order.paid
              ? "Facture acquittée — aucun règlement complémentaire n'est dû."
              : "Facture non acquittée à ce jour. Règlement à la remise de la commande."}
          </p>
          <p>
            Les denrées alimentaires périssables ne sont pas soumises au droit de rétractation (art.
            L221-28 3° du code de la consommation). Voir nos conditions générales de vente.
          </p>
          <p className="pt-1">
            Merci de votre confiance — {seller.name}, {seller.tagline}.
          </p>
        </footer>
      </article>
    </div>
  );
}
