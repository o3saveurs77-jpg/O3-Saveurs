"use client";

import Link from "next/link";
import { useOrders } from "@/components/providers/OrdersContext";
import { info, fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { Emblem } from "@/components/Brand";

export function InvoiceClient({ id }: { id: string }) {
  const { getById, ready } = useOrders();
  const order = getById(id);

  if (!ready) return <div className="wrap py-24 text-center text-ink-2">Chargement…</div>;
  if (!order)
    return (
      <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-2xl">Facture introuvable</h1>
        <Link href="/compte" className="rounded-full bg-primary px-6 py-3 font-bold text-white">
          Mon compte
        </Link>
      </div>
    );

  const num =
    "FACT-" +
    new Date(order.createdAt).getFullYear() +
    "-" +
    order.ref.replace("#", "");
  const date = new Date(order.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="wrap max-w-2xl py-10">
      {/* barre d'actions (cachée à l'impression) */}
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href="/compte" className="inline-flex items-center gap-1.5 font-semibold text-ink-2 hover:text-ink">
          <Icon name="chevL" size={18} /> Retour
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white hover:brightness-105"
        >
          <Icon name="arrow" size={18} /> Télécharger / Imprimer
        </button>
      </div>

      {/* document facture */}
      <article className="rounded-[var(--radius-card)] border border-line bg-white p-8 text-ink shadow-[var(--shadow-soft)] print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <Emblem size={52} />
            <div>
              <p className="font-display text-xl">Ô 3 Saveurs — Chez Laila</p>
              <p className="text-sm text-ink-2">{info.address}</p>
              <p className="text-sm text-ink-2">{info.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl">FACTURE</h1>
            <p className="text-sm text-ink-2">{num}</p>
            <p className="text-sm text-ink-2">{date}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 py-6 text-sm">
          <div>
            <p className="font-bold text-ink-2">Facturé à</p>
            <p className="mt-1 font-semibold">{order.customer.name}</p>
            <p>{order.customer.email}</p>
            <p>{order.customer.phone}</p>
            {order.customer.address && (
              <p>{order.customer.address}, {order.customer.zip} {order.customer.city}</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-bold text-ink-2">Commande</p>
            <p className="mt-1 font-semibold">{order.ref}</p>
            <p className="capitalize">{order.mode}</p>
            <p>Payé par {order.paymentMethod}</p>
          </div>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-line text-left text-ink-2">
              <th className="py-2 font-semibold">Article</th>
              <th className="py-2 text-center font-semibold">Qté</th>
              <th className="py-2 text-right font-semibold">P.U.</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.key} className="border-b border-line">
                <td className="py-2.5">
                  {l.name}
                  {l.formule && <span className="block text-xs text-ink-2">{l.formule}</span>}
                  {Object.values(l.opts).length > 0 && (
                    <span className="block text-xs text-ink-2">{Object.values(l.opts).join(" · ")}</span>
                  )}
                </td>
                <td className="py-2.5 text-center">{l.qty}</td>
                <td className="py-2.5 text-right">{fmtPrice(l.unitPrice)}</td>
                <td className="py-2.5 text-right font-semibold">{fmtPrice(l.unitPrice * l.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-2">Sous-total</span>
            <span>{fmtPrice(order.subtotal)}</span>
          </div>
          {order.fee > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-2">Frais de livraison</span>
              <span>{fmtPrice(order.fee)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <span>Total TTC</span>
            <span className="text-brick">{fmtPrice(order.total)}</span>
          </div>
        </div>

        <footer className="mt-8 border-t border-line pt-4 text-center text-xs text-ink-2">
          <p>TVA non applicable, art. 293 B du CGI.</p>
          <p className="mt-1">Merci de votre confiance — Ô 3 Saveurs, Chez Laila.</p>
        </footer>
      </article>
    </div>
  );
}
