"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useOrders } from "@/components/providers/OrdersContext";
import { fmtPrice } from "@/lib/menu";
import { STATUS_FLOW, STATUS_LABEL } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";
import { Icon } from "@/components/Icon";

const STEP_ICON: Record<OrderStatus, string> = {
  confirmee: "check",
  cuisine: "flame",
  route: "truck",
  livree: "home",
  annulee: "x",
};

export function OrderTracker({ id }: { id: string }) {
  const { getById, ready, setStatus } = useOrders();
  const order = getById(id);

  // simulation : avance automatiquement le statut toutes les ~12 s (démo)
  useEffect(() => {
    if (!order || order.status === "livree" || order.status === "annulee") return;
    const idx = STATUS_FLOW.indexOf(order.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const t = setTimeout(() => setStatus(order.id, STATUS_FLOW[idx + 1]), 12000);
    return () => clearTimeout(t);
  }, [order, setStatus]);

  if (!ready) {
    return <div className="wrap py-24 text-center text-ink-2">Chargement…</div>;
  }

  if (!order) {
    return (
      <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
        <Icon name="search" size={48} className="text-ink-2 opacity-30" />
        <h1 className="text-2xl">Commande introuvable</h1>
        <Link href="/carte" className="rounded-full bg-primary px-6 py-3 font-bold text-white">
          Retour à la carte
        </Link>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const cancelled = order.status === "annulee";
  const lastLabel = order.mode === "emporter" ? "Prête !" : "Livrée";

  return (
    <div className="wrap max-w-3xl py-10">
      {/* confirmation */}
      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 text-center shadow-[var(--shadow-soft)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e9f7f4] text-teal">
          <Icon name="check" size={34} />
        </div>
        <h1 className="mt-4 text-3xl">Merci pour votre commande !</h1>
        <p className="mt-1 text-ink-2">
          Commande <strong className="text-ink">{order.ref}</strong> · un email de confirmation et la
          facture vous ont été envoyés.
        </p>
      </div>

      {/* suivi */}
      {!cancelled && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
          <h2 className="mb-6 text-lg">Suivi en temps réel</h2>
          <ol className="relative flex justify-between">
            {/* ligne de progression */}
            <div className="absolute left-0 top-5 h-1 w-full -translate-y-1/2 rounded bg-line" />
            <div
              className="absolute left-0 top-5 h-1 -translate-y-1/2 rounded bg-teal transition-all duration-700"
              style={{ width: `${(currentIdx / (STATUS_FLOW.length - 1)) * 100}%` }}
            />
            {STATUS_FLOW.map((s, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx;
              const label = i === STATUS_FLOW.length - 1 ? lastLabel : STATUS_LABEL[s];
              return (
                <li key={s} className="relative z-10 flex flex-1 flex-col items-center gap-2">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-full border-2 transition ${
                      done
                        ? "border-teal bg-teal text-white"
                        : "border-line bg-panel text-ink-2"
                    } ${active ? "ring-4 ring-teal/20" : ""}`}
                  >
                    <Icon name={STEP_ICON[s]} size={18} />
                  </span>
                  <span className={`text-center text-xs font-semibold ${done ? "text-ink" : "text-ink-2"}`}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 text-center text-sm text-ink-2">
            {order.status === "livree"
              ? "Bon appétit ! 🍽️"
              : "Statut mis à jour automatiquement (démo) — vous recevrez une notification à chaque étape."}
          </p>
        </div>
      )}

      {cancelled && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-6 text-center text-brick shadow-[var(--shadow-soft)]">
          Cette commande a été annulée.
        </div>
      )}

      {/* détails */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-bold">Détails</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-2">Mode</dt>
              <dd className="font-semibold capitalize">{order.mode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Créneau</dt>
              <dd className="font-semibold">{order.slot === "asap" ? "Au plus vite" : order.slot}</dd>
            </div>
            {order.mode === "livraison" && order.zoneIdx != null && (
              <div className="flex justify-between">
                <dt className="text-ink-2">Zone</dt>
                <dd className="font-semibold">Zone {order.zoneIdx + 1}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-2">Paiement</dt>
              <dd className="font-semibold">{order.paymentMethod}</dd>
            </div>
            {order.driver && (
              <div className="flex justify-between">
                <dt className="text-ink-2">Livreur</dt>
                <dd className="font-semibold">{order.driver}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-bold">Votre panier</h3>
          <ul className="space-y-2 text-sm">
            {order.lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-2">
                <span>{l.qty}× {l.name}</span>
                <span className="font-semibold">{fmtPrice(l.unitPrice * l.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="my-3 h-px bg-line" />
          <div className="flex justify-between text-sm">
            <span className="text-ink-2">Sous-total</span>
            <span>{fmtPrice(order.subtotal)}</span>
          </div>
          {order.fee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-2">Livraison</span>
              <span>{fmtPrice(order.fee)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between font-bold">
            <span>Total</span>
            <span className="text-brick">{fmtPrice(order.total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/compte" className="rounded-full border border-line bg-panel px-6 py-3 font-semibold hover:bg-panel-2">
          Mes commandes
        </Link>
        <Link href="/carte" className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:brightness-105">
          Commander à nouveau
        </Link>
      </div>
    </div>
  );
}
