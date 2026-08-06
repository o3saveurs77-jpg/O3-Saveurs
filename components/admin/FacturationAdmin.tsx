"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtPrice } from "@/lib/menu";
import { vatBreakdown, formatInvoiceNumber } from "@/lib/money";
import { valid, fetchAllOrders, MAX_FETCHED_ORDERS } from "@/lib/analytics";
import { Icon } from "@/components/Icon";
import type { Order } from "@/lib/types";

/*
 * L'écran s'appuyait sur `useOrders()` (OrdersContext), qui ne charge que les
 * 50 commandes les plus récentes — une pagination pensée pour l'aperçu du
 * back-office, pas pour la facturation. Dès que le restaurant dépassait
 * 50 commandes, les factures plus anciennes disparaissaient silencieusement de
 * la liste ET du CSV, alors que l'écran annonce plus bas un « export CSV
 * complet ». `fetchAllOrders` (lib/analytics.ts) a été écrit précisément pour
 * cet écran — voir son commentaire — mais n'était jamais appelé ici.
 */
export function FacturationAdmin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { orders: rows, truncated: t } = await fetchAllOrders({ paid: true });
      setOrders(rows);
      setTruncated(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Les factures n'ont pas pu être chargées.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invoices = useMemo(
    () => valid(orders).sort((a, b) => b.createdAt - a.createdAt),
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

      {error && (
        <p
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brick/30 bg-primary-soft p-4 text-sm text-brick"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="shrink-0 rounded-full bg-brick px-4 py-1.5 font-bold text-white transition hover:brightness-105"
          >
            Réessayer
          </button>
        </p>
      )}

      {truncated && (
        <p className="rounded-xl border border-line bg-panel-2 p-3 text-xs text-ink-2">
          Plus de {MAX_FETCHED_ORDERS} factures payées existent : seules les {MAX_FETCHED_ORDERS}{" "}
          les plus récentes sont chargées ici.
        </p>
      )}

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
