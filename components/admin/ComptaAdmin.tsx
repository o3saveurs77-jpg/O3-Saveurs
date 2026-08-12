"use client";

/* Export comptable — vient s'ajouter à Facturation, ne la remplace pas.
 *
 * Ceci est un outil de REPORTING : il exporte des données déjà enregistrées
 * (commandes payées), il n'encaisse rien lui-même. Ce n'est donc pas un
 * logiciel de caisse au sens de la loi anti-fraude TVA (art. 286-I-3° bis
 * CGI) — cette distinction est importante, voir AUDIT.md / conversation avec
 * le porteur du projet : une vraie caisse (point de vente) demande une
 * certification NF525 que cet écran n'a pas vocation à contourner.
 */

import { useMemo, useState } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { invoiced, inRange, modeSplit, netCollectedCents } from "@/lib/analytics";
import { vatBreakdown, fmtVatRate, formatInvoiceNumber } from "@/lib/money";
import { formatCreditNoteNumber } from "@/lib/refunds";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import type { Order } from "@/lib/types";

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function endOfToday(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function toInputDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const euros = (cents: number) => (cents / 100).toFixed(2);

export function ComptaAdmin() {
  const { orders, ready } = useOrders();
  const [du, setDu] = useState(toInputDate(startOfMonth()));
  const [au, setAu] = useState(toInputDate(endOfToday()));

  const range = useMemo(() => {
    const start = new Date(du).getTime();
    const end = new Date(au).getTime() + 24 * 60 * 60 * 1000 - 1;
    return { start, end };
  }, [du, au]);

  const periode = useMemo(
    () => inRange(orders, range.start, range.end),
    [orders, range],
  );
  /* Base comptable : les commandes **facturées**, et non les seules commandes
   * non annulées. Un plat sur commande refusé par le restaurant est annulé
   * après avoir été facturé et remboursé ; l'écarter ferait disparaître du
   * journal une facture et son avoir, donc un trou inexpliqué dans deux
   * numérotations séquentielles. Voir `lib/analytics.ts`. */
  const facturees = useMemo(() => invoiced(periode), [periode]);

  /** Ce qui reste réellement acquis : facturé moins remboursé. */
  const totalTTC = facturees.reduce((s, o) => s + netCollectedCents(o), 0);
  const totalRembourse = facturees.reduce((s, o) => s + o.refundedCents, 0);
  const avoirs = useMemo(() => facturees.filter((o) => o.refundedCents > 0), [facturees]);
  const panierMoyen = facturees.length > 0 ? Math.round(totalTTC / facturees.length) : 0;

  /** Ventilation par taux de TVA — la plupart des commandes partagent le même taux,
   * mais `vatRateBp` est figé par commande : un changement de taux en cours de
   * route ne doit jamais réécrire les commandes passées.
   *
   * L'assiette est le montant **net de remboursement** : la ventiler sur le
   * total facturé faisait déclarer, et payer, de la TVA sur des sommes rendues
   * au client. */
  const parTaux = useMemo(() => {
    const map = new Map<number, { rateBp: number; netCents: number; vatCents: number; grossCents: number; n: number }>();
    for (const o of facturees) {
      const vat = vatBreakdown(netCollectedCents(o), o.vatRateBp);
      const e = map.get(o.vatRateBp) ?? { rateBp: o.vatRateBp, netCents: 0, vatCents: 0, grossCents: 0, n: 0 };
      e.netCents += vat.netCents;
      e.vatCents += vat.vatCents;
      e.grossCents += vat.grossCents;
      e.n += 1;
      map.set(o.vatRateBp, e);
    }
    return [...map.values()].sort((a, b) => a.rateBp - b.rateBp);
  }, [facturees]);

  const parPaiement = useMemo(() => {
    const map = new Map<string, { n: number; cents: number }>();
    for (const o of facturees) {
      const e = map.get(o.paymentMethod) ?? { n: 0, cents: 0 };
      e.n += 1;
      e.cents += netCollectedCents(o);
      map.set(o.paymentMethod, e);
    }
    return [...map.entries()].sort((a, b) => b[1].cents - a[1].cents);
  }, [facturees]);

  const parMode = useMemo(() => modeSplit(facturees), [facturees]);

  /** Compte de caisse/banque selon le moyen de paiement — seule distinction
   * qui compte pour l'écriture comptable : espèces vs tout le reste. */
  const compteEncaissement = (o: Order) => (o.paymentMethod === "Espèces sur place" ? "530" : "512");

  const dateFr = (ms: number) => new Date(ms).toLocaleDateString("fr-FR");

  /* Journal des ventes : les lignes restent au prix facturé — c'est ce qui a
     été vendu. La colonne « Avoir » signale la pièce qui l'annule, sans quoi
     un plat sur commande refusé apparaîtrait comme une vente ordinaire. */
  const exportVentes = () => {
    const header = [
      "Date",
      "Référence",
      "Facture",
      "Article",
      "Qté",
      "P.U. TTC",
      "Total TTC",
      "Taux TVA",
      "Avoir",
      "Remboursé TTC",
    ];
    const rows: (string | number)[][] = [];
    for (const o of facturees) {
      for (const l of o.lines) {
        rows.push([
          dateFr(o.createdAt),
          o.ref,
          formatInvoiceNumber(o.invoiceNumber, new Date(o.createdAt)),
          l.name,
          l.qty,
          euros(l.unitPriceCents),
          euros(l.lineTotalCents),
          fmtVatRate(o.vatRateBp),
          o.refundedCents > 0
            ? formatCreditNoteNumber(o.creditNoteNumber, new Date(o.refundedAt ?? o.createdAt))
            : "",
          o.refundedCents > 0 ? euros(o.refundedCents) : "",
        ]);
      }
    }
    downloadCsv(`journal-ventes-${du}-au-${au}.csv`, header, rows);
  };

  const exportEcritures = () => {
    const header = ["Date", "Pièce", "Compte", "Libellé", "Débit", "Crédit"];
    const rows: (string | number)[][] = [];
    for (const o of facturees) {
      const date = dateFr(o.createdAt);
      const piece = formatInvoiceNumber(o.invoiceNumber, new Date(o.createdAt));
      const libelle = `Commande ${o.ref}`;

      /* La vente est enregistrée pour son montant **facturé**, pas pour son
         montant net : c'est ce que dit la facture, et une facture ne se
         réécrit pas. Le remboursement vient ensuite, en pièce séparée. */
      const vat = vatBreakdown(o.totalCents, o.vatRateBp);
      rows.push([date, piece, "411", `${libelle} — client`, euros(o.totalCents), ""]);
      rows.push([date, piece, "707", `${libelle} — vente HT`, "", euros(vat.netCents)]);
      rows.push([date, piece, "44571", `${libelle} — TVA collectée`, "", euros(vat.vatCents)]);
      rows.push([date, piece, compteEncaissement(o), `${libelle} — encaissement`, euros(o.totalCents), ""]);
      rows.push([date, piece, "411", `${libelle} — solde client`, "", euros(o.totalCents)]);

      /* Avoir : l'écriture exactement symétrique, à sa propre date et sous son
         propre numéro. C'est elle qui neutralise la TVA collectée sur une
         somme rendue — sans quoi la déclaration porte sur de l'argent que le
         restaurant n'a plus. */
      if (o.refundedCents > 0) {
        const dateAvoir = dateFr(o.refundedAt ?? o.createdAt);
        const avoir = formatCreditNoteNumber(
          o.creditNoteNumber,
          new Date(o.refundedAt ?? o.createdAt),
        );
        const rembourse = vatBreakdown(o.refundedCents, o.vatRateBp);
        const lib = `Avoir ${o.ref}`;
        rows.push([dateAvoir, avoir, "707", `${lib} — annulation vente HT`, euros(rembourse.netCents), ""]);
        rows.push([dateAvoir, avoir, "44571", `${lib} — TVA à régulariser`, euros(rembourse.vatCents), ""]);
        rows.push([dateAvoir, avoir, "411", `${lib} — client`, "", euros(o.refundedCents)]);
        rows.push([dateAvoir, avoir, "411", `${lib} — remboursement`, euros(o.refundedCents), ""]);
        rows.push([dateAvoir, avoir, compteEncaissement(o), `${lib} — sortie`, "", euros(o.refundedCents)]);
      }
    }
    downloadCsv(`ecritures-comptables-${du}-au-${au}.csv`, header, rows);
  };

  const exportTva = () => {
    const header = [
      "Taux TVA",
      "Nombre de factures",
      "Total HT",
      "TVA collectée",
      "Total TTC",
    ];
    const rows: (string | number)[][] = parTaux.map((t) => [
      fmtVatRate(t.rateBp),
      t.n,
      euros(t.netCents),
      euros(t.vatCents),
      euros(t.grossCents),
    ]);
    // Le total remboursé est déjà déduit ligne à ligne ; on le rappelle pour
    // que le rapprochement avec les relevés bancaires soit immédiat.
    if (totalRembourse > 0) {
      rows.push([]);
      rows.push(["Dont avoirs déduits", avoirs.length, "", "", `- ${euros(totalRembourse)}`]);
    }
    downloadCsv(`tva-${du}-au-${au}.csv`, header, rows);
  };

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Compta & TVA</h1>
          <p className="text-ink-2">Export de reporting — n'encaisse rien, ne remplace pas un logiciel de caisse.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={du}
            onChange={(e) => setDu(e.target.value)}
            className="rounded-full border border-line bg-panel px-3.5 py-2 text-sm"
            aria-label="Du"
          />
          <input
            type="date"
            value={au}
            onChange={(e) => setAu(e.target.value)}
            className="rounded-full border border-line bg-panel px-3.5 py-2 text-sm"
            aria-label="Au"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <p className="text-sm text-ink-2">CA net encaissé</p>
          <p className="mt-1 font-display text-2xl text-brick">{fmtPrice(totalTTC)}</p>
          <p className="mt-0.5 text-xs text-ink-2">facturé moins remboursé</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <p className="text-sm text-ink-2">Factures émises</p>
          <p className="mt-1 font-display text-2xl">{facturees.length}</p>
        </div>
        {/* Le montant rendu doit se lire, et pas seulement se déduire : c'est
            lui qui explique l'écart entre le chiffre d'affaires facturé et ce
            qui est réellement resté sur le compte. */}
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <p className="text-sm text-ink-2">Avoirs</p>
          <p className="mt-1 font-display text-2xl text-teal">
            {totalRembourse > 0 ? `− ${fmtPrice(totalRembourse)}` : fmtPrice(0)}
          </p>
          <p className="mt-0.5 text-xs text-ink-2">
            {avoirs.length} pièce{avoirs.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <p className="text-sm text-ink-2">Panier moyen</p>
          <p className="mt-1 font-display text-2xl">{fmtPrice(panierMoyen)}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-bold">Ventilation TVA</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-2">
              <tr>
                <th className="pb-2">Taux</th>
                <th className="pb-2 text-right">HT</th>
                <th className="pb-2 text-right">TVA</th>
              </tr>
            </thead>
            <tbody>
              {parTaux.map((t) => (
                <tr key={t.rateBp} className="border-t border-line">
                  <td className="py-2">{fmtVatRate(t.rateBp)}</td>
                  <td className="py-2 text-right">{fmtPrice(t.netCents)}</td>
                  <td className="py-2 text-right">{fmtPrice(t.vatCents)}</td>
                </tr>
              ))}
              {parTaux.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-ink-2">
                    Aucune commande sur la période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-bold">Moyens de paiement</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-2">
              <tr>
                <th className="pb-2">Moyen</th>
                <th className="pb-2 text-right">Nb</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {parPaiement.map(([mode, v]) => (
                <tr key={mode} className="border-t border-line">
                  <td className="py-2">{mode}</td>
                  <td className="py-2 text-right">{v.n}</td>
                  <td className="py-2 text-right">{fmtPrice(v.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-bold">Modes de vente</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-2">
              <tr>
                <th className="pb-2">Mode</th>
                <th className="pb-2 text-right">Nb</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {parMode.map((m) => (
                <tr key={m.mode} className="border-t border-line">
                  <td className="py-2 capitalize">{m.mode}</td>
                  <td className="py-2 text-right">{m.orders}</td>
                  <td className="py-2 text-right">{fmtPrice(m.orderedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
        <h3 className="mb-1 font-bold">Extractions comptables (CSV)</h3>
        <p className="mb-4 text-sm text-ink-2">
          Séparateur « ; », encodage UTF-8 avec BOM, décimales en euros — pour la période sélectionnée.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <button
            onClick={exportVentes}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-panel-2"
          >
            <Icon name="list" size={16} /> Journal des ventes
          </button>
          <button
            onClick={exportEcritures}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-panel-2"
          >
            <Icon name="chart" size={16} /> Écritures comptables
          </button>
          <button
            onClick={exportTva}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-panel-2"
          >
            <Icon name="euro" size={16} /> Ventilation TVA
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-panel-2 p-4 text-sm text-ink-2">
        <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-primary" />
        <p>
          Ces exports sont une aide pour votre comptable, pas un logiciel de caisse certifié. La
          facturation électronique (Factur-X) et la certification d'un futur point de vente sont à
          traiter séparément, avec votre expert-comptable.
        </p>
      </div>
    </div>
  );
}
