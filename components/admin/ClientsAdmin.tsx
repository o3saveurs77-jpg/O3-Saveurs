"use client";

/* Fichier clients — agrégation des commandes par client.
 *
 * L'écran additionnait ce que lui donnait `OrdersContext` sans jamais regarder
 * si la lecture avait abouti. Or le contexte, quand `/api/orders` échoue, pose
 * une liste vide puis annonce qu'elle est prête : l'écran affichait donc
 * « 0 client · 0,00 € cumulés », c'est-à-dire exactement ce qu'il afficherait
 * d'un restaurant sans aucun client. Une panne de réseau ressemblait à une
 * faillite. `error` et `truncated` sont désormais lus, dits, et réessayables.
 */

import { useMemo, useState } from "react";
import { useOrders } from "@/components/providers/OrdersContext";
import { fmtPrice } from "@/lib/menu";
import { MAX_FETCHED_ORDERS, valid } from "@/lib/analytics";
import type { Order } from "@/lib/types";
import { Icon } from "@/components/Icon";

export interface ClientRow {
  email: string;
  name: string;
  phone: string;
  orders: number;
  spent: number;
  last: number;
}

/**
 * Regroupement par client, du plus gros panier cumulé au plus petit.
 * Fonction pure, et exportée pour être testée hors du rendu : c'est elle qui
 * produit les chiffres montrés à la cliente.
 */
export function clientRows(orders: Order[]): ClientRow[] {
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
    e.spent += o.totalCents;
    e.last = Math.max(e.last, o.createdAt);
    map.set(o.customer.email, e);
  });
  return [...map.values()].sort((a, b) => b.spent - a.spent);
}

/** Recherche sur le nom et l'adresse, insensible à la casse. */
export function matchClient(c: ClientRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  return c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle);
}

export function ClientsAdmin() {
  const { orders, total, ready, error: loadFailed, truncated, refresh } = useOrders();
  const [q, setQ] = useState("");

  const clients = useMemo(() => clientRows(orders), [orders]);
  const filtered = useMemo(() => clients.filter((c) => matchClient(c, q)), [clients, q]);

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Clients</h1>
        {/* Un total de 0 € est une information ; il ne doit sortir que d'une
            lecture réussie. */}
        <p className="text-ink-2">
          {loadFailed
            ? "Fichier client indisponible — les commandes n'ont pas pu être lues."
            : `${clients.length} client${clients.length > 1 ? "s" : ""} · ${fmtPrice(
                clients.reduce((s, c) => s + c.spent, 0),
              )} cumulés.`}
        </p>
      </div>

      {loadFailed && (
        <p
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brick/30 bg-primary-soft p-4 text-sm text-brick"
        >
          <span>
            <strong>Lecture des commandes impossible.</strong> Le fichier client est construit à
            partir d&apos;elles : ce tableau est vide faute de données, pas faute de clients.
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 rounded-full bg-brick px-4 py-1.5 font-bold text-white transition hover:brightness-105"
          >
            Réessayer
          </button>
        </p>
      )}

      {/* Au-delà du plafond, les cumuls par client sont mécaniquement
          sous-évalués : un habitué de dix ans peut n'en porter que trois. */}
      {truncated && (
        <p className="rounded-xl border border-line bg-panel-2 p-3 text-xs text-ink-2">
          {total} commandes existent : seules les {MAX_FETCHED_ORDERS} plus récentes sont prises en
          compte. Les totaux cumulés ci-dessous ne portent que sur elles.
        </p>
      )}

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
            {/* Un tableau sans ligne ne disait rien du tout : on distingue la
                recherche sans résultat du fichier réellement vide. */}
            {filtered.length === 0 && !loadFailed && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-2">
                  {clients.length === 0
                    ? "Aucun client enregistré pour l'instant."
                    : "Aucun client ne correspond à cette recherche."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
