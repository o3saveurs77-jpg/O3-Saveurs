"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useOrders } from "@/components/providers/OrdersContext";
import { revenueByDay, ordersByStatus, topDishes, kpis } from "@/lib/analytics";
import { STATUS_LABEL } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "@/components/Icon";

const COLORS = {
  primary: "#e8732a",
  brick: "#a6243a",
  teal: "#1fa89a",
  gold: "#f2b705",
  ink2: "#856a50",
};
const STATUS_PIE: Record<OrderStatus, string> = {
  confirmee: COLORS.gold,
  cuisine: COLORS.primary,
  route: COLORS.teal,
  livree: "#2e8b57",
  annulee: COLORS.brick,
};

export function Overview() {
  const { orders, ready } = useOrders();
  const now = useMemo(() => Date.now(), []);

  const data = useMemo(() => {
    return {
      byDay: revenueByDay(orders, now, 14),
      byStatus: ordersByStatus(orders),
      top: topDishes(orders, 6),
      k: kpis(orders, now),
    };
  }, [orders, now]);

  if (!ready) return <p className="py-20 text-center text-ink-2">Chargement des données…</p>;

  const { byDay, byStatus, top, k } = data;
  const pieData = (Object.keys(byStatus) as OrderStatus[]).map((s) => ({
    name: STATUS_LABEL[s],
    value: byStatus[s],
    status: s,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Vue d'ensemble</h1>
        <p className="text-ink-2">Activité du restaurant en temps réel.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="CA aujourd'hui" value={fmtPrice(k.caToday)} icon="euro" sub={`${k.ordersToday} commande(s)`} />
        <Kpi
          label="CA 7 jours"
          value={fmtPrice(k.caWeek)}
          icon="chart"
          sub={`${k.weekTrend >= 0 ? "+" : ""}${k.weekTrend}% vs préc.`}
          trend={k.weekTrend}
        />
        <Kpi label="Panier moyen" value={fmtPrice(k.avg)} icon="bag" sub={`${k.total} commandes`} />
        <Kpi label="Taux de livraison" value={`${k.deliveryRate}%`} icon="truck" sub="commandes livrées" />
      </div>

      {/* CA par jour */}
      <Card title="Chiffre d'affaires — 14 derniers jours">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={byDay} margin={{ left: -18, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eadfca" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: COLORS.ink2 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12, fill: COLORS.ink2 }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v: number) => [fmtPrice(v), "CA"]}
              contentStyle={{ borderRadius: 12, border: "1px solid #e7d3b0" }}
            />
            <Area type="monotone" dataKey="ca" stroke={COLORS.primary} strokeWidth={2.5} fill="url(#caGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* commandes par jour */}
        <Card title="Commandes par jour">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byDay} margin={{ left: -22, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eadfca" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: COLORS.ink2 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: COLORS.ink2 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(v: number) => [v, "Commandes"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e7d3b0" }}
              />
              <Bar dataKey="commandes" fill={COLORS.teal} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* commandes par statut */}
        <Card title="Répartition par statut">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d) => (
                    <Cell key={d.status} fill={STATUS_PIE[d.status]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7d3b0" }} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-2 text-sm">
              {pieData.map((d) => (
                <li key={d.status} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: STATUS_PIE[d.status] }} />
                    {d.name}
                  </span>
                  <span className="font-bold">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* top plats */}
      <Card title="Plats les plus vendus">
        <ResponsiveContainer width="100%" height={Math.max(220, top.length * 42)}>
          <BarChart data={top} layout="vertical" margin={{ left: 40, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eadfca" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: COLORS.ink2 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 12, fill: COLORS.ink2 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v: number, n) => [n === "qty" ? `${v} vendus` : fmtPrice(v as number), ""]}
              contentStyle={{ borderRadius: 12, border: "1px solid #e7d3b0" }}
            />
            <Bar dataKey="qty" fill={COLORS.gold} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  sub,
  trend,
}: {
  label: string;
  value: string;
  icon: string;
  sub?: string;
  trend?: number;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl">{value}</p>
      {sub && (
        <p className={`mt-1 text-xs ${trend != null ? (trend >= 0 ? "text-teal" : "text-brick") : "text-ink-2"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 text-lg">{title}</h2>
      {children}
    </div>
  );
}
