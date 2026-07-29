"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";
import { fmtCents } from "@/lib/money";
import { STATUS_LABEL, ORDER_STATUSES } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";
import { Icon, type IconName } from "@/components/Icon";
import type {
  DayPoint,
  PeriodComparison,
  StatsResponse,
  StageDelay,
  ZoneSplit,
} from "@/lib/analytics";

/* ── Palette de graphiques ────────────────────────────────────
 *
 * Dérivée de la charte, puis **validée** (bande de clarté OKLCH, plancher de
 * chroma, séparation sous protanopie/deutéranopie, contraste ≥ 3:1 sur le fond
 * blanc des cartes). Le turquoise et le doré de la charte ont dû être assombris
 * pour passer : `text-teal` et le doré d'origine tombent à 2,4–3,0:1.
 *
 * Deux séries seulement se touchent (CA commandé / CA encaissé) : elles
 * occupent les emplacements 1 et 2, dans cet ordre, et ne changent jamais.
 */
const SERIES = {
  /** emplacement 1 — CA commandé */
  ordered: "#e8732a",
  /** emplacement 2 — CA encaissé */
  collected: "#0d9184",
} as const;

const AXIS = "#856a50"; // text-ink-2
const GRID = "#eadfca"; // hairline, une teinte au-dessus du fond

/** Rampe ordinale d'une seule teinte (clair → foncé) pour les étapes du flux. */
const FLOW_RAMP = ["#f0a06b", "#e8732a", "#c25c17", "#8d3f0d"] as const;

/** Le statut n'est pas une identité de série : c'est un état. Couleurs réservées. */
const STATUS_COLOR: Record<OrderStatus, string> = {
  en_attente_paiement: "#b98705", // attention — paiement non acquis
  confirmee: FLOW_RAMP[0],
  cuisine: FLOW_RAMP[1],
  route: FLOW_RAMP[2],
  livree: FLOW_RAMP[3],
  annulee: "#a6243a", // critique
};

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
        <p className="py-20 text-center text-ink-2">
          {loading ? "Chargement des données…" : "Aucune donnée à afficher."}
        </p>
      ) : (
        // Pas de squelette au rechargement : on garde le rendu précédent en
        // retrait, sinon la page saute à chaque actualisation.
        <div className={loading ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}>
          <Alerts alerts={stats.alerts} />
          <Today period={stats.periods.day} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

/* ── Alertes (5.6) ─────────────────────────────────────────── */

function Alerts({ alerts }: { alerts: StatsResponse["alerts"] }) {
  const items: {
    icon: IconName;
    tone: "critique" | "attention";
    text: string;
    href?: string;
  }[] = [];

  if (alerts.late.count > 0) {
    items.push({
      icon: "clock",
      tone: "critique",
      text: `${alerts.late.count} commande(s) en retard — la plus ancienne attend depuis ${
        alerts.late.orders[0]?.minutes ?? 0
      } min`,
      href: "/admin/cuisine",
    });
  }
  if (alerts.unpaid.count > 0) {
    items.push({
      icon: "euro",
      tone: "attention",
      text: `${alerts.unpaid.count} commande(s) acceptée(s) non encaissée(s) — ${fmtCents(
        alerts.unpaid.totalCents,
      )} à encaisser`,
      href: "/admin/commandes?filtre=impayees",
    });
  }
  if (alerts.lowStock.length > 0) {
    items.push({
      icon: "box",
      tone: "attention",
      text: `Stock bas : ${alerts.lowStock
        .slice(0, 4)
        .map((d) => `${d.name} (${d.stock})`)
        .join(", ")}${alerts.lowStock.length > 4 ? `, +${alerts.lowStock.length - 4}` : ""}`,
      href: "/admin/stocks",
    });
  }
  if (alerts.abandoned.count > 0) {
    items.push({
      icon: "cart",
      tone: "attention",
      text: `${alerts.abandoned.count} panier(s) abandonné(s) depuis plus de 30 min — ${fmtCents(
        alerts.abandoned.totalCents,
      )} perdus`,
      href: "/admin/commandes?filtre=abandonnes",
    });
  }

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">
        <Icon name="check" size={18} className="text-ink" />
        Rien à signaler : pas de retard, pas d&apos;impayé, pas de stock bas.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.text}>
          <div
            className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] px-4 py-3 text-sm font-semibold ${
              a.tone === "critique"
                ? "bg-brick text-white"
                : "border border-line bg-panel-2 text-ink"
            }`}
          >
            <Icon name={a.icon} size={18} />
            <span>{a.text}</span>
            {a.href && (
              <Link
                href={a.href}
                className={`ml-auto inline-flex items-center gap-1 underline ${
                  a.tone === "critique" ? "text-white" : "text-ink"
                }`}
              >
                Voir <Icon name="arrow" size={14} />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Le chiffre du jour ────────────────────────────────────── */

function Today({ period }: { period: PeriodComparison }) {
  const { current, previous } = period;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-ink-2">CA encaissé aujourd&apos;hui</p>
          {/* 48 px fixes : « 1 234,56 € » dépassait la carte sur un écran de
              320 px et poussait la page entière. */}
          <p className="font-display text-3xl leading-none sm:text-5xl">
            {fmtCents(current.collectedCents)}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            <Trend pct={period.collectedTrendPct} /> vs {period.previousLabel} (
            {fmtCents(previous.collectedCents)})
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 sm:gap-x-8">
          <Facet
            term="CA commandé"
            hint="payé ou non, annulées exclues"
            value={fmtCents(current.orderedCents)}
          />
          <Facet
            term="Reste à encaisser"
            hint="espèces à confirmer"
            value={fmtCents(current.pendingCents)}
          />
          <Facet term="Commandes" value={String(current.orders)} hint="hors annulées" />
        </dl>
      </div>
    </div>
  );
}

function Facet({ term, value, hint }: { term: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-ink-2">{term}</dt>
      <dd className="font-display text-xl">{value}</dd>
      {hint && <p className="text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

/** Variation signée. Sans référence, on écrit « pas de référence », pas « 0 % ». */
function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-ink-2">Pas de référence</span>;
  const sign = pct > 0 ? "+" : "";
  return (
    <span className="font-semibold text-ink">
      {sign}
      {pct.toLocaleString("fr-FR")} %
    </span>
  );
}

function PeriodTile({ period, icon }: { period: PeriodComparison; icon: IconName }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">{period.label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-2 text-xs uppercase tracking-wide text-ink-2">CA encaissé</p>
      <p className="font-display text-2xl">{fmtCents(period.current.collectedCents)}</p>
      <p className="mt-1 text-xs text-ink-2">
        CA commandé {fmtCents(period.current.orderedCents)} · {period.current.orders} commande(s)
      </p>
      <p className="mt-1 text-xs text-ink-2">
        <Trend pct={period.collectedTrendPct} /> vs {period.previousLabel}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon: IconName;
  sub?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

/* ── Graphiques ───────────────────────────────────────────── */

/** Axe monétaire : les centimes ne s'affichent pas sur une graduation. */
const euroTick = (cents: number) => `${Math.round(cents / 100)} €`;

function Card({
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

const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${GRID}`,
  fontSize: 13,
} as const;

function RevenueChart({ series, days }: { series: DayPoint[]; days: number }) {
  return (
    <Card
      title="Chiffre d'affaires"
      subtitle={`${days} derniers jours · commandé (payé ou non) et encaissé`}
      table={
        <table className="w-full min-w-[420px] text-sm tabular-nums">
          <caption className="sr-only">
            Chiffre d&apos;affaires commandé et encaissé par jour
          </caption>
          <thead className="text-left text-ink-2">
            <tr>
              <th scope="col" className="py-2 font-semibold">
                Jour
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                CA commandé
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                CA encaissé
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Commandes
              </th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.ts} className="border-t border-line">
                <td className="py-2">{p.day}</td>
                <td className="py-2 text-right">{fmtCents(p.orderedCents)}</td>
                <td className="py-2 text-right">{fmtCents(p.collectedCents)}</td>
                <td className="py-2 text-right">{p.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={290}>
        <ComposedChart data={series} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="caCommande" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.ordered} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SERIES.ordered} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 12, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            tickFormatter={euroTick}
            width={60}
          />
          <Tooltip
            formatter={(v, name) => [fmtCents(Number(v)), String(name)]}
            contentStyle={tooltipStyle}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="plainline"
            wrapperStyle={{ fontSize: 13, color: AXIS }}
          />
          <Area
            type="monotone"
            dataKey="orderedCents"
            name="CA commandé"
            stroke={SERIES.ordered}
            strokeWidth={2}
            fill="url(#caCommande)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
          />
          <Line
            type="monotone"
            dataKey="collectedCents"
            name="CA encaissé"
            stroke={SERIES.collected}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

function OrdersChart({ series, days }: { series: DayPoint[]; days: number }) {
  return (
    <Card title="Commandes par jour" subtitle={`${days} derniers jours · hors annulées`}>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={series} margin={{ left: -12, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={14}
          />
          <YAxis
            tick={{ fontSize: 12, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={34}
          />
          <Tooltip formatter={(v) => [`${v} commande(s)`, ""]} contentStyle={tooltipStyle} />
          <Bar
            dataKey="orders"
            name="Commandes"
            fill={SERIES.ordered}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/**
 * Les statuts sont les étapes d'un flux : un camembert de six parts se lit mal
 * et cache les petites valeurs. Barres étiquetées, chiffre à côté du libellé.
 */
function StatusBreakdown({
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

function TopDishes({ dishes, days }: { dishes: StatsResponse["topDishes"]; days: number }) {
  if (dishes.length === 0) {
    return (
      <Card title="Plats les plus vendus" subtitle={`${days} derniers jours`}>
        <p className="py-10 text-center text-sm text-ink-2">Aucune vente sur la période.</p>
      </Card>
    );
  }

  return (
    <Card
      title="Plats les plus vendus"
      subtitle={`${days} derniers jours · quantités vendues`}
      table={
        <table className="w-full min-w-[360px] text-sm tabular-nums">
          <caption className="sr-only">Quantités et chiffre d&apos;affaires par plat</caption>
          <thead className="text-left text-ink-2">
            <tr>
              <th scope="col" className="py-2 font-semibold">
                Plat
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Vendus
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                CA commandé
              </th>
            </tr>
          </thead>
          <tbody>
            {dishes.map((d) => (
              <tr key={d.dishId} className="border-t border-line">
                <td className="py-2">{d.name}</td>
                <td className="py-2 text-right">{d.qty}</td>
                <td className="py-2 text-right">{fmtCents(d.orderedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={Math.max(200, dishes.length * 40 + 20)}>
        <BarChart
          data={dishes}
          layout="vertical"
          margin={{ left: 4, right: 44, top: 4, bottom: 4 }}
        >
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            tick={{ fontSize: 12, fill: AXIS }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v, _n, item) => [
              `${v} vendus · ${fmtCents(Number(item?.payload?.orderedCents ?? 0))}`,
              "",
            ]}
            contentStyle={tooltipStyle}
          />
          <Bar
            dataKey="qty"
            name="Vendus"
            fill={SERIES.ordered}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
          >
            <LabelList dataKey="qty" position="right" style={{ fill: AXIS, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function PeakHours({ hours, days }: { hours: StatsResponse["hours"]; days: number }) {
  // Les 24 tranches sont illisibles ; on ne montre que les heures de service.
  const active = hours.filter((h) => h.hour >= 10 && h.hour <= 23);
  return (
    <Card
      title="Heures de pointe"
      subtitle={`${days} derniers jours · commandes reçues par heure (Paris)`}
      table={
        <table className="w-full min-w-[300px] text-sm tabular-nums">
          <caption className="sr-only">Commandes reçues par heure</caption>
          <thead className="text-left text-ink-2">
            <tr>
              <th scope="col" className="py-2 font-semibold">
                Heure
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Commandes
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                CA commandé
              </th>
            </tr>
          </thead>
          <tbody>
            {active.map((h) => (
              <tr key={h.hour} className="border-t border-line">
                <td className="py-2">{h.label}</td>
                <td className="py-2 text-right">{h.orders}</td>
                <td className="py-2 text-right">{fmtCents(h.orderedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={active} margin={{ left: -12, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 11, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(h: number) => `${h}h`}
          />
          <YAxis
            tick={{ fontSize: 12, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={34}
          />
          <Tooltip
            labelFormatter={(h) => `${h} h`}
            formatter={(v) => [`${v} commande(s)`, ""]}
            contentStyle={tooltipStyle}
          />
          <Bar
            dataKey="orders"
            name="Commandes"
            fill={SERIES.ordered}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function Zones({
  zones,
  modes,
  days,
}: {
  zones: ZoneSplit[];
  modes: StatsResponse["modes"];
  days: number;
}) {
  const max = Math.max(1, ...zones.map((z) => z.orderedCents));
  return (
    <Card title="Livraison & zones" subtitle={`${days} derniers jours`}>
      <dl className="mb-4 grid grid-cols-2 gap-3">
        {modes.map((m) => (
          <div key={m.mode} className="rounded-xl border border-line bg-panel-2 p-3">
            <dt className="text-xs text-ink-2">
              {m.mode === "livraison" ? "Livraison" : "À emporter"}
            </dt>
            <dd className="font-display text-xl">{m.sharePct.toLocaleString("fr-FR")} %</dd>
            <p className="text-xs text-ink-2">
              {m.orders} commande(s) · {fmtCents(m.orderedCents)}
            </p>
          </div>
        ))}
      </dl>

      {zones.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">Aucune commande sur la période.</p>
      ) : (
        <ul className="space-y-3">
          {zones.map((z) => (
            <li key={String(z.zoneIdx)}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {z.zoneIdx === null ? "Sans zone (à emporter)" : `Zone ${z.zoneIdx + 1}`}
                </span>
                <span className="tabular-nums text-ink-2">
                  {fmtCents(z.orderedCents)} · {z.orders} cmd · frais {fmtCents(z.feeCents)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(z.orderedCents / max) * 100}%`,
                    background: SERIES.ordered,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Delays({
  delays,
  margin,
  days,
}: {
  delays: StageDelay[];
  margin: StatsResponse["margin"];
  days: number;
}) {
  return (
    <Card title="Délais réels & marge" subtitle={`${days} derniers jours`}>
      {/* Quatre colonnes chiffrées : sous ~400 px les intitulés d'étape se
          cassaient lettre à lettre. On défile plutôt que d'illisibiliser. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm tabular-nums">
          <caption className="sr-only">Délais moyens et médians par étape</caption>
          <thead className="text-left text-ink-2">
            <tr>
              <th scope="col" className="py-2 font-semibold">
                Étape
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Moyenne
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Médiane
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Mesures
              </th>
            </tr>
          </thead>
          <tbody>
            {delays.map((d) => (
              <tr key={d.key} className="border-t border-line">
                <td className="py-2">{d.label}</td>
                <td className="py-2 text-right">
                  {d.avgMinutes === null ? "—" : `${d.avgMinutes} min`}
                </td>
                <td className="py-2 text-right">
                  {d.medianMinutes === null ? "—" : `${d.medianMinutes} min`}
                </td>
                <td className="py-2 text-right text-ink-2">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4">
        <p className="text-xs text-ink-2">Marge estimée (coûts matière saisis)</p>
        {margin.coveragePct === 0 ? (
          <p className="mt-1 text-sm">
            Aucun coût matière renseigné : saisissez-les sur les plats pour obtenir une marge.
          </p>
        ) : (
          <>
            <p className="font-display text-2xl">{fmtCents(margin.marginCents)}</p>
            <p className="text-xs text-ink-2">
              {margin.marginPct.toLocaleString("fr-FR")} % sur {fmtCents(margin.coveredCents)} de CA
              · coûts connus sur {margin.coveragePct.toLocaleString("fr-FR")} % du CA
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
