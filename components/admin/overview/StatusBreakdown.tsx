"use client";

import { Card } from "./Card";
import { STATUS_COLOR } from "./colors";
import { STATUS_LABEL, ORDER_STATUSES } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";

/**
 * Les statuts sont les étapes d'un flux : un camembert de six parts se lit mal
 * et cache les petites valeurs. Barres étiquetées, chiffre à côté du libellé.
 */
export default function StatusBreakdown({
  byStatus,
  days,
}: {
  byStatus: Record<OrderStatus, number>;
  days: number;
}) {
  const total = ORDER_STATUSES.reduce((s, k) => s + byStatus[k], 0);
  const max = Math.max(1, ...ORDER_STATUSES.map((k) => byStatus[k]));

  return (
    <Card
      title="Répartition par statut"
      subtitle={`${days} derniers jours · ${total} commande(s) au total`}
    >
      <ul className="space-y-3">
        {ORDER_STATUSES.map((s) => (
          <li key={s}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[s] }}
                />
                <span className="font-semibold">{STATUS_LABEL[s]}</span>
              </span>
              <span className="tabular-nums text-ink-2">
                {byStatus[s]}
                {total > 0 && ` · ${Math.round((byStatus[s] / total) * 100)} %`}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(byStatus[s] / max) * 100}%`,
                  background: STATUS_COLOR[s],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
