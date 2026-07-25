"use client";

import { useMemo } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { DRIVERS } from "@/lib/mockOrders";
import { STATUS_FLOW, STATUS_LABEL } from "@/lib/types";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { StatusPill } from "./StatusPill";

export function LivraisonsAdmin() {
  const { orders, ready, setStatus, assignDriver } = useOrders();

  const deliveries = useMemo(
    () =>
      orders.filter(
        (o) => o.mode === "livraison" && o.status !== "annulee" && o.status !== "livree"
      ),
    [orders]
  );

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Livraisons</h1>
        <p className="text-ink-2">{deliveries.length} livraison(s) en cours.</p>
      </div>

      {/* livreurs */}
      <div className="flex flex-wrap gap-2">
        {DRIVERS.map((d) => {
          const load = deliveries.filter((o) => o.driver === d).length;
          return (
            <span key={d} className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                {d[0]}
              </span>
              {d}
              <span className="text-ink-2">· {load} course(s)</span>
            </span>
          );
        })}
      </div>

      <div className="space-y-3">
        {deliveries.map((o) => {
          const idx = STATUS_FLOW.indexOf(o.status);
          const next = idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
          return (
            <div key={o.id} className="rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-panel-2 text-primary">
                    <Icon name="truck" size={18} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{o.ref}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <p className="text-sm text-ink-2">
                      {o.customer.name} · {o.customer.address}, {o.customer.city}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-brick">{fmtPrice(o.total)}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-sm text-ink-2">Livreur :</label>
                <select
                  value={o.driver ?? ""}
                  onChange={(e) => assignDriver(o.id, e.target.value || null)}
                  className="rounded-full border border-line bg-page px-4 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Non affecté</option>
                  {DRIVERS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {next && (
                  <button
                    onClick={() => setStatus(o.id, next)}
                    className="ml-auto inline-flex items-center gap-2 rounded-full bg-teal px-5 py-2 text-sm font-bold text-white hover:brightness-105"
                  >
                    <Icon name="check" size={15} /> {STATUS_LABEL[next]}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {deliveries.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
            Aucune livraison en cours.
          </p>
        )}
      </div>
    </div>
  );
}
