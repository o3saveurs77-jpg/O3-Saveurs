"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function Card({
  title,
  subtitle,
  children,
  table,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** jumelle tabulaire — un graphique ne doit jamais être le seul accès aux valeurs */
  table?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    /* `min-w-0` : en cellule de grille la largeur minimale vaut `auto`, donc le
       graphique imposait sa largeur mesurée au lieu de suivre la colonne — les
       deux cartes côte à côte débordaient dès que la fenêtre se resserrait. */
    <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg">{title}</h2>
          {subtitle && <p className="text-xs text-ink-2">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-panel-2"
          >
            <Icon name="list" size={14} /> {showTable ? "Voir le graphique" : "Voir les chiffres"}
          </button>
        )}
      </div>
      {showTable && table ? <div className="overflow-x-auto">{table}</div> : children}
    </div>
  );
}

/**
 * Gabarit affiché pendant que le chunk d'un graphique (Recharts) se charge —
 * même hauteur que le graphique final, pour ne jamais faire sauter la page une
 * fois le module arrivé.
 */
export function ChartCardSkeleton({ height = 290 }: { height?: number }) {
  return (
    <div className="min-w-0 animate-pulse rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <div className="mb-4 h-5 w-40 rounded bg-panel-2" />
      <div className="rounded-xl bg-panel-2" style={{ height }} />
    </div>
  );
}

/**
 * Squelette du premier chargement — même gabarit que la page une fois les
 * statistiques arrivées, pour que rien ne saute visuellement à leur arrivée.
 */
export function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-[var(--radius-card)] border border-line bg-panel" />
      <div className="h-28 rounded-[var(--radius-card)] border border-line bg-panel" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-32 rounded-[var(--radius-card)] border border-line bg-panel" />
        ))}
      </div>
      <ChartCardSkeleton height={290} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCardSkeleton height={250} />
        <ChartCardSkeleton height={250} />
      </div>
    </div>
  );
}
