"use client";

import { useMemo, useState } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { STATUS_FLOW, STATUS_LABEL } from "@/lib/types";
import type { Order, OrderStatus } from "@/lib/types";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { StatusPill } from "./StatusPill";

const FILTERS: { k: OrderStatus | "all" | "actives"; label: string }[] = [
  { k: "actives", label: "En cours" },
  { k: "all", label: "Toutes" },
  { k: "confirmee", label: "Confirmées" },
  { k: "cuisine", label: "En cuisine" },
  { k: "route", label: "En route" },
  { k: "livree", label: "Livrées" },
  { k: "annulee", label: "Annulées" },
];

export function OrdersAdmin() {
  const { orders, ready, setStatus } = useOrders();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["k"]>("actives");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "actives") return orders.filter((o) => o.status === "confirmee" || o.status === "cuisine" || o.status === "route");
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Commandes</h1>
        <p className="text-ink-2">{filtered.length} commande(s) affichée(s).</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f.k ? "bg-primary text-white" : "border border-line bg-panel hover:bg-panel-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            open={openId === o.id}
            onToggle={() => setOpenId((id) => (id === o.id ? null : o.id))}
            onStatus={(s) => setStatus(o.id, s)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
            Aucune commande dans cette catégorie.
          </p>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  open,
  onToggle,
  onStatus,
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  onStatus: (s: OrderStatus) => void;
}) {
  const idx = STATUS_FLOW.indexOf(order.status);
  const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  const time = new Date(order.createdAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel-2 text-primary">
          <Icon name={order.mode === "livraison" ? "truck" : "bag"} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{order.ref}</span>
            <StatusPill status={order.status} />
          </div>
          <p className="truncate text-sm text-ink-2">
            {order.customer.name} · {time} · {order.lines.reduce((s, l) => s + l.qty, 0)} articles
          </p>
        </div>
        <span className="shrink-0 font-bold text-brick">{fmtPrice(order.total)}</span>
        <Icon name={open ? "chevDown" : "chevron"} size={18} className="shrink-0 text-ink-2" />
      </button>

      {open && (
        <div className="border-t border-line bg-page/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold text-ink-2">Articles</h3>
              <ul className="space-y-1 text-sm">
                {order.lines.map((l) => (
                  <li key={l.key} className="flex justify-between gap-2">
                    <span>
                      {l.qty}× {l.name}
                      {l.formule && <span className="text-ink-2"> · {l.formule}</span>}
                    </span>
                    <span>{fmtPrice(l.unitPrice * l.qty)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-ink-2">Client</h3>
              <p className="text-sm">{order.customer.name}</p>
              <p className="text-sm text-ink-2">{order.customer.phone}</p>
              <p className="text-sm text-ink-2">{order.customer.email}</p>
              {order.customer.address && (
                <p className="text-sm text-ink-2">
                  {order.customer.address}, {order.customer.zip} {order.customer.city}
                </p>
              )}
              {order.driver && <p className="mt-1 text-sm">Livreur : <strong>{order.driver}</strong></p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {next && order.status !== "annulee" && (
              <button
                onClick={() => onStatus(next)}
                className="inline-flex items-center gap-2 rounded-full bg-teal px-5 py-2.5 text-sm font-bold text-white hover:brightness-105"
              >
                <Icon name="check" size={16} /> Passer à « {STATUS_LABEL[next]} »
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-panel-2"
            >
              <Icon name="list" size={16} /> Imprimer le ticket
            </button>
            {order.status !== "annulee" && order.status !== "livree" && (
              <button
                onClick={() => onStatus("annulee")}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-brick hover:bg-brick/10"
              >
                <Icon name="x" size={16} /> Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
