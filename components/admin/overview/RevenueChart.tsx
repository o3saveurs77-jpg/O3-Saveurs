"use client";

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { fmtCents } from "@/lib/money";
import { Card } from "./Card";
import { SERIES, AXIS, GRID, tooltipStyle, euroTick } from "./colors";
import type { DayPoint } from "@/lib/analytics";

export default function RevenueChart({ series, days }: { series: DayPoint[]; days: number }) {
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
