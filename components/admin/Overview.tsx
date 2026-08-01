"use client";

/* Vue d'ensemble du back-office.
 *
 * Les sous-composants vivent dans `components/admin/overview/` : un fichier
 * par bloc (alertes, tuiles, chaque graphique) plutôt qu'un seul fichier de
 * ~900 lignes, pour que modifier un graphique n'oblige pas à relire les autres.
 *
 * Les graphiques (Recharts) sont chargés en `next/dynamic({ ssr: false })` :
 * cette bibliothèque ne sert à rien avant que `/api/stats` ait répondu, et la
 * séparer du chunk principal laisse les tuiles et les alertes s'afficher sans
 * attendre son analyse par le navigateur.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fmtCents } from "@/lib/money";
import { Icon } from "@/components/Icon";
import type { StatsResponse } from "@/lib/analytics";
import { Alerts } from "./overview/Alerts";
import { Today, PeriodTile, Tile } from "./overview/KpiTiles";
import { BudgetTile } from "./overview/BudgetTile";
import { Zones } from "./overview/Zones";
import { Delays } from "./overview/Delays";
import { ChartCardSkeleton, OverviewSkeleton } from "./overview/Card";

const RevenueChart = dynamic(() => import("./overview/RevenueChart"), {
  ssr: false,
  loading: () => <ChartCardSkeleton height={290} />,
});
const OrdersChart = dynamic(() => import("./overview/OrdersChart"), {
  ssr: false,
  loading: () => <ChartCardSkeleton height={250} />,
});
const StatusBreakdown = dynamic(() => import("./overview/StatusBreakdown"), {
  ssr: false,
  loading: () => <ChartCardSkeleton height={250} />,
});
const TopDishes = dynamic(() => import("./overview/TopDishes"), {
  ssr: false,
  loading: () => <ChartCardSkeleton height={250} />,
});
const PeakHours = dynamic(() => import("./overview/PeakHours"), {
  ssr: false,
  loading: () => <ChartCardSkeleton height={250} />,
});

const DAY_CHOICES = [7, 14, 30, 90] as const;

export function Overview() {
  const [days, setDays] = useState<number>(14);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?days=${d}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Chargement des statistiques impossible");
      }
      setStats((await res.json()) as StatsResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement des statistiques impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Vue d&apos;ensemble</h1>
          <p className="text-ink-2">
            Chiffres calculés sur le serveur, en heure de Paris — ils ne dépendent plus du fuseau de
            cet ordinateur.
          </p>
        </div>
        {stats && (
          <p className="text-xs text-ink-2">
            Arrêté à{" "}
            {new Date(stats.generatedAt).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Paris",
            })}{" "}
            (Paris)
          </p>
        )}
      </div>

      {/* Une seule barre de filtres, au-dessus de tout ce qu'elle cadre. */}
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel p-3">
        <span className="pl-1 text-sm font-semibold text-ink-2" id="periode-label">
          Période
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="periode-label">
          {DAY_CHOICES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                days === d
                  ? "bg-ink text-cream"
                  : "border border-line bg-panel text-ink hover:bg-panel-2"
              }`}
            >
              {d} jours
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => load(days)}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-panel-2"
        >
          <Icon name="refresh" size={16} /> Actualiser
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {loading ? "Chargement des statistiques" : error ? error : "Statistiques à jour"}
      </p>

      {error && (
        <p className="rounded-[var(--radius-card)] border border-brick/30 bg-brick/5 px-4 py-3 text-sm font-semibold text-brick">
          {error}
        </p>
      )}

      {!stats ? (
        loading ? (
          <OverviewSkeleton />
        ) : (
          <p className="py-20 text-center text-ink-2">Aucune donnée à afficher.</p>
        )
      ) : (
        // Pas de squelette au rechargement : on garde le rendu précédent en
        // retrait, sinon la page saute à chaque actualisation.
        <div className={loading ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}>
          <Alerts alerts={stats.alerts} />
          <Today period={stats.periods.day} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <PeriodTile period={stats.periods.week} icon="chart" />
            <PeriodTile period={stats.periods.month} icon="euro" />
            <Tile
              label="Panier moyen (ce mois-ci)"
              value={fmtCents(stats.periods.month.current.avgBasketCents)}
              icon="bag"
              sub={`${stats.periods.month.current.orders} commande(s) valides`}
            />
            <Tile
              label="Taux d'annulation (ce mois-ci)"
              value={`${stats.periods.month.current.cancelRatePct.toLocaleString("fr-FR")} %`}
              icon="x"
              sub={`${stats.periods.month.current.canceled} commande(s) annulée(s)`}
            />
            <BudgetTile />
          </div>

          <RevenueChart series={stats.series} days={stats.days} />

          <div className="grid gap-6 lg:grid-cols-2">
            <OrdersChart series={stats.series} days={stats.days} />
            <StatusBreakdown byStatus={stats.byStatus} days={stats.days} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopDishes dishes={stats.topDishes} days={stats.days} />
            <PeakHours hours={stats.hours} days={stats.days} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Zones zones={stats.zones} modes={stats.modes} days={stats.days} />
            <Delays delays={stats.delays} margin={stats.margin} days={stats.days} />
          </div>
        </div>
      )}
    </div>
  );
}
