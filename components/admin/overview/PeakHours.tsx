"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { fmtCents } from "@/lib/money";
import { Card } from "./Card";
import { SERIES, AXIS, GRID, tooltipStyle } from "./colors";
import type { StatsResponse } from "@/lib/analytics";

export default function PeakHours({ hours, days }: { hours: StatsResponse["hours"]; days: number }) {
  // Les 24 tranches sont illisibles ; on ne montre que les heures de service.
  const active = useMemo(() => hours.filter((h) => h.hour >= 10 && h.hour <= 23), [hours]);
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
