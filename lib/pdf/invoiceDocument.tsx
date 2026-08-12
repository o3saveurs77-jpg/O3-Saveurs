/* Facture — même document que `InvoiceClient`, rendu en PDF côté serveur.
 *
 * Couleurs et structure alignées sur `app/globals.css` (charte graphique du
 * site) pour que le PDF envoyé par email et téléchargé depuis `/facture/[id]`
 * ait le même rendu que la page imprimée. Polices standard (Helvetica) : pas
 * de fichier de police à embarquer ni de dépendance réseau au rendu.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Order } from "@/lib/types";
import type { InvoiceSeller } from "@/lib/invoice";
import { fmtCents, fmtVatRate, vatBreakdownByRate, formatInvoiceNumber } from "@/lib/money";
import { vatPartsOf } from "@/lib/types";

const COLOR = {
  ink: "#2c1d11",
  ink2: "#856a50",
  primary: "#e8732a",
  brick: "#a6243a",
  teal: "#1fa89a",
  line: "#e7d3b0",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: COLOR.ink },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    marginBottom: 18,
    borderBottom: `1pt solid ${COLOR.line}`,
  },
  sellerBlock: { flexDirection: "row", gap: 10, maxWidth: 300 },
  logoOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLOR.brick,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLOR.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12 },
  sellerName: { fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 3 },
  sellerLine: { color: COLOR.ink2, fontSize: 9, marginBottom: 1.5, lineHeight: 1.3 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 3, letterSpacing: 1 },
  titleMeta: { fontSize: 9, color: COLOR.ink2, marginBottom: 1.5 },

  section: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  sectionCol: { maxWidth: "48%" },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: COLOR.ink2,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionText: { fontSize: 9.5, marginBottom: 1.5, lineHeight: 1.3 },
  paidText: { fontSize: 9.5, color: COLOR.teal, fontFamily: "Helvetica-Bold", marginTop: 3 },
  dueText: { fontSize: 9.5, color: COLOR.brick, fontFamily: "Helvetica-Bold", marginTop: 3 },

  tableHeadRow: {
    flexDirection: "row",
    borderTop: `1pt solid ${COLOR.line}`,
    borderBottom: `1pt solid ${COLOR.line}`,
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${COLOR.line}`,
    paddingVertical: 7,
  },
  thName: { flex: 3, fontFamily: "Helvetica-Bold", fontSize: 8.5, color: COLOR.ink2 },
  thQty: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 8.5, color: COLOR.ink2, textAlign: "center" },
  thPrice: { flex: 1.3, fontFamily: "Helvetica-Bold", fontSize: 8.5, color: COLOR.ink2, textAlign: "right" },
  tdName: { flex: 3, fontSize: 9.5 },
  tdDetail: { fontSize: 8, color: COLOR.ink2, marginTop: 2 },
  tdQty: { flex: 1, fontSize: 9.5, textAlign: "center" },
  tdPrice: { flex: 1.3, fontSize: 9.5, textAlign: "right" },
  tdTotal: { flex: 1.3, fontSize: 9.5, textAlign: "right", fontFamily: "Helvetica-Bold" },

  totals: { alignSelf: "flex-end", width: 230, marginTop: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalLabel: { fontSize: 9.5, color: COLOR.ink2 },
  totalValue: { fontSize: 9.5 },
  vatBlock: { marginTop: 5, paddingTop: 5, borderTop: `0.5pt solid ${COLOR.line}` },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1pt solid ${COLOR.line}`,
  },
  grandLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COLOR.brick },

  footer: { marginTop: 32, paddingTop: 14, borderTop: `0.5pt solid ${COLOR.line}`, textAlign: "center" },
  footerText: { fontSize: 7.5, color: COLOR.ink2, marginBottom: 3, lineHeight: 1.4 },
});

/**
 * Avoir à émettre sur cette commande, quand le document en est un.
 *
 * Un avoir n'est pas une facture corrigée : la facture reste telle qu'émise
 * (art. 242 nonies A CGI), et l'avoir constate la somme rendue. Les deux
 * partagent le même gabarit — même identité vendeur, même détail des lignes —
 * pour que le client reconnaisse la pièce qu'on lui rembourse.
 */
export interface CreditNote {
  /** Numéro déjà formaté (« AV-2026-000042 »). */
  number: string;
  /** Montant rendu par cette opération, en centimes. */
  amountCents: number;
  /** Total rendu sur la commande, cumul compris. */
  totalRefundedCents: number;
  reason: string;
  at: Date;
}

export function InvoiceDocument({
  order,
  seller,
  creditNote,
}: {
  order: Order;
  seller: InvoiceSeller;
  creditNote?: CreditNote;
}) {
  const createdAt = new Date(order.createdAt);
  /* Ventilation par taux — voir `InvoiceClient`, qui rend le même document à
     l'écran. Les deux doivent afficher exactement les mêmes montants : le PDF
     est la pièce que le client archive. */
  const buckets = vatBreakdownByRate(vatPartsOf(order), {
    feeCents: order.feeCents,
    discountCents: order.discountCents,
  });
  const totalHT = buckets.reduce((s, b) => s + b.netCents, 0);
  const number = formatInvoiceNumber(order.invoiceNumber, createdAt);
  const paidAt = order.timeline.confirmedAt ?? order.createdAt;

  return (
    <Document title={creditNote ? `Avoir ${creditNote.number}` : `Facture ${number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.sellerBlock}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoText}>Ô3</Text>
              </View>
            </View>
            <View>
              <Text style={styles.sellerName}>
                {seller.company || `${seller.name} — ${seller.tagline}`}
              </Text>
              {seller.company ? (
                <Text style={styles.sellerLine}>
                  {seller.name} — {seller.tagline}
                </Text>
              ) : null}
              {seller.legalForm ? <Text style={styles.sellerLine}>{seller.legalForm}</Text> : null}
              <Text style={styles.sellerLine}>{seller.address}</Text>
              <Text style={styles.sellerLine}>
                {seller.phone}
                {seller.email ? ` · ${seller.email}` : ""}
              </Text>
              <Text style={styles.sellerLine}>
                SIRET : {seller.siret || "à compléter"}
                {seller.vatNumber ? ` · TVA : ${seller.vatNumber}` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{creditNote ? "AVOIR" : "FACTURE"}</Text>
            <Text style={styles.titleMeta}>{creditNote ? creditNote.number : number}</Text>
            <Text style={styles.titleMeta}>
              Émis{creditNote ? "" : "e"} le {dateFmt.format(creditNote ? creditNote.at : createdAt)}
            </Text>
            {/* Un avoir doit renvoyer à la facture qu'il corrige, sans quoi rien
                ne relie la sortie d'argent à la vente d'origine. */}
            {creditNote && <Text style={styles.titleMeta}>Facture {number}</Text>}
            <Text style={styles.titleMeta}>Commande {order.ref}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCol}>
            <Text style={styles.sectionLabel}>Facturé à</Text>
            <Text style={[styles.sectionText, { fontFamily: "Helvetica-Bold" }]}>
              {order.customer.name}
            </Text>
            <Text style={styles.sectionText}>{order.customer.email}</Text>
            <Text style={styles.sectionText}>{order.customer.phone}</Text>
            {order.customer.address ? (
              <Text style={styles.sectionText}>
                {order.customer.address}, {order.customer.zip} {order.customer.city}
              </Text>
            ) : null}
          </View>
          <View style={[styles.sectionCol, { alignItems: "flex-end" }]}>
            <Text style={styles.sectionLabel}>Prestation</Text>
            <Text style={[styles.sectionText, { fontFamily: "Helvetica-Bold" }]}>
              {order.mode === "livraison" ? "Livraison à domicile" : "Vente à emporter"}
            </Text>
            <Text style={styles.sectionText}>
              Créneau : {order.slot === "asap" ? "dès que possible" : order.slot}
            </Text>
            {order.paid ? (
              <Text style={styles.paidText}>
                Payé par {order.paymentMethod} le {dateTimeFmt.format(new Date(paidAt))}
              </Text>
            ) : (
              <Text style={styles.dueText}>
                Reste à payer : {fmtCents(order.totalCents)} ({order.paymentMethod})
              </Text>
            )}
          </View>
        </View>

        <View>
          <View style={styles.tableHeadRow}>
            <Text style={styles.thName}>Article</Text>
            <Text style={styles.thQty}>Qté</Text>
            <Text style={styles.thPrice}>P.U. TTC</Text>
            <Text style={styles.thPrice}>Total TTC</Text>
          </View>
          {order.lines.map((l, i) => {
            const detail = l.formule || Object.values(l.opts).join(" · ");
            return (
              <View key={`${l.dishId}-${i}`} style={styles.tableRow} wrap={false}>
                <View style={styles.tdName}>
                  <Text>{l.name}</Text>
                  {detail ? <Text style={styles.tdDetail}>{detail}</Text> : null}
                </View>
                <Text style={styles.tdQty}>{l.qty}</Text>
                <Text style={styles.tdPrice}>{fmtCents(l.unitPriceCents)}</Text>
                <Text style={styles.tdTotal}>{fmtCents(l.lineTotalCents)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sous-total</Text>
            <Text style={styles.totalValue}>{fmtCents(order.subtotalCents)}</Text>
          </View>
          {order.discountCents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Remise{order.promoCode ? ` (${order.promoCode})` : ""}
              </Text>
              <Text style={[styles.totalValue, { color: COLOR.teal }]}>
                -{fmtCents(order.discountCents)}
              </Text>
            </View>
          ) : null}
          {order.feeCents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Frais de livraison</Text>
              <Text style={styles.totalValue}>{fmtCents(order.feeCents)}</Text>
            </View>
          ) : null}
          {/* Une ligne de TVA **par taux** : c'est ce qu'exige l'art. 242
              nonies A, et une commande peut en porter deux — 10 % sur les
              plats, 5,5 % sur une boisson en contenant fermé. */}
          <View style={styles.vatBlock}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{fmtCents(totalHT)}</Text>
            </View>
            {buckets.map((b) => (
              <View style={styles.totalRow} key={b.rateBp}>
                <Text style={styles.totalLabel}>
                  TVA {fmtVatRate(b.rateBp)}
                  {buckets.length > 1 ? ` sur ${fmtCents(b.netCents)} HT` : ""}
                </Text>
                <Text style={styles.totalValue}>{fmtCents(b.vatCents)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total TTC</Text>
            <Text style={styles.grandValue}>{fmtCents(order.totalCents)}</Text>
          </View>

          {/* Le montant rendu, en négatif : c'est l'objet même de la pièce, il
              ne doit pas se confondre avec le total de la vente. */}
          {creditNote && (
            <>
              <View style={styles.grandRow}>
                <Text style={styles.grandLabel}>Montant remboursé</Text>
                <Text style={styles.grandValue}>− {fmtCents(creditNote.amountCents)}</Text>
              </View>
              {creditNote.totalRefundedCents !== creditNote.amountCents && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total remboursé à ce jour</Text>
                  <Text style={styles.totalValue}>
                    {fmtCents(creditNote.totalRefundedCents)}
                  </Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Reste acquis</Text>
                <Text style={styles.totalValue}>
                  {fmtCents(Math.max(0, order.totalCents - creditNote.totalRefundedCents))}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Montants en euros. Restauration à emporter ou livrée : TVA à 10 % (art. 279 m du CGI).
            Boissons non alcoolisées en contenant fermé : 5,5 % (art. 278-0 bis A).
          </Text>
          <Text style={styles.footerText}>
            {creditNote
              ? `Avoir émis en remboursement de la facture ${number}${
                  creditNote.reason ? ` — motif : ${creditNote.reason}` : ""
                }. La facture d'origine reste valable et n'est ni annulée ni modifiée.`
              : order.paid
                ? "Facture acquittée — aucun règlement complémentaire n'est dû."
                : "Facture non acquittée à ce jour. Règlement à la remise de la commande."}
          </Text>
          <Text style={styles.footerText}>
            Les denrées alimentaires périssables ne sont pas soumises au droit de rétractation (art.
            L221-28 3° du code de la consommation). Voir nos conditions générales de vente.
          </Text>
          <Text style={[styles.footerText, { marginTop: 5 }]}>
            Merci de votre confiance — {seller.name}, {seller.tagline}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
