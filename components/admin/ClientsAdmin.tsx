"use client";

import { useMemo, useState } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { fmtPrice } from "@/lib/menu";
import { valid } from "@/lib/analytics";
import { Icon } from "@/components/Icon";

interface ClientRow {
  email: string;
  name: string;
  phone: string;
  orders: number;
  spent: number;
  last: number;
}

export function ClientsAdmin() {
  const { orders, ready } = useOrders();
  const [q, setQ] = useState("");

  const clients = useMemo(() => {
    const map = new Map<string, ClientRow>();
    valid(orders).forEach((o) => {
      const e = map.get(o.customer.email) ?? {
        email: o.customer.email,
        name: o.customer.name,
        phone: o.customer.phone,
        orders: 0,
        spent: 0,
        last: 0,
      };
      e.orders += 1;
      e.spent += o.total;
      e.last = Math.max(e.last, o.createdAt);
      map.set(o.customer.email, e);
    });
    return [...map.values()].sort((a, b) => b.spent - a.spent);
  }, [orders]);

  const filtered = clients.filter(
    (c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())
  );

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Clients</h1>
        <p className="text-ink-2">{clients.length} clients · {fmtPrice(clients.reduce((s, c) => s + c.spent, 0))} cumulés.</p>
      </div>

      <div className="flex max-w-sm items-center gap-2 rounded-full border border-line bg-panel px-4">
        <Icon name="search" size={18} className="text-ink-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client…"
          className="w-full bg-transparent py-2.5 text-sm outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)]">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-panel-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Téléphone</th>
              <th className="px-4 py-3 text-center font-semibold">Commandes</th>
              <th className="px-4 py-3 text-right font-semibold">Total dépensé</th>
              <th className="px-4 py-3 text-right font-semibold">Dernière</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.email} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-ink-2">{c.email}</p>
                </td>
                <td className="px-4 py-3 text-ink-2">{c.phone}</td>
                <td className="px-4 py-3 text-center">{c.orders}</td>
                <td className="px-4 py-3 text-right font-bold text-brick">{fmtPrice(c.spent)}</td>
                <td className="px-4 py-3 text-right text-ink-2">
                  {new Date(c.last).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
