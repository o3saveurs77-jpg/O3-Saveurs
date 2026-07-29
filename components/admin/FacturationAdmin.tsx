"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useOrders } from "@/components/providers/OrdersContext";
import { fmtPrice } from "@/lib/menu";
import { vatBreakdown, formatInvoiceNumber } from "@/lib/money";
import { valid } from "@/lib/analytics";
import { Icon } from "@/components/Icon";

export function FacturationAdmin() {
  const { orders, ready } = useOrders();

  const invoices = useMemo(
    () => valid(orders).filter((o) => o.paid).sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  const total = invoices.reduce((s, o) => s + o.totalCents, 0);

  const exportCsv = () => {
    const header = [
      "Numero de facture",
      "Reference",
      "Date",
      "Client",
      "Email",
      "Mode",
      "Sous-total HT",
      "TVA",
      "Frais de livraison",
      "Remise",
      "Total TTC",
      "Paiement",
    ];
    // Montants exportés en euros à deux décimales, depuis les centimes : c'est
    // le format qu'attend un tableur, et la conversion se fait une seule fois,
    // ici, sans jamais réintroduire de flottant dans les calculs.
    const rows = invoices.map((o) => {
      const vat = vatBreakdown(o.totalCents, o.vatRateBp);
      return [
        formatInvoiceNumber(o.invoiceNumber, new Date(o.createdAt)),
        o.ref,
        new Date(o.createdAt).toLocaleDateString("fr-FR"),
        o.customer.name,
        o.customer.email,
        o.mode,
        (vat.netCents / 100).toFixed(2),
        (vat.vatCents / 100).toFixed(2),
        (o.feeCents / 100).toFixed(2),
        (o.discountCents / 100).toFixed(2),
        (o.totalCents / 100).toFixed(2),
        o.paymentMethod,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "factures-o3-saveurs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Facturation</h1>
          <p className="text-ink-2">
            {invoices.length} factures · {fmtPrice(total)} encaissés.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:brightness-105"
        >
          <Icon name="arrow" size={16} /> Exporter (CSV)
        </button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-panel-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-3 font-semibold">Référence</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Paiement</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3"><span className="sr-only">Facture</span></th>
            </tr>
          </thead>
          <tbody>
            {invoices.slice(0, 100).map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{o.ref}</td>
                <td className="px-4 py-3 text-ink-2">
                  {new Date(o.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-3">{o.customer.name}</td>
                <td className="px-4 py-3 text-ink-2">{o.paymentMethod}</td>
                <td className="px-4 py-3 text-right font-bold text-brick">
                  {fmtPrice(o.totalCents)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/facture/${o.id}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                    <Icon name="arrow" size={15} /> Voir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoices.length > 100 && (
        <p className="text-center text-xs text-ink-2">100 factures les plus récentes affichées · export CSV complet.</p>
      )}
    </div>
  );
}
