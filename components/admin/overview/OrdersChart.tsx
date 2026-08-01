"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card } from "./Card";
import { SERIES, AXIS, GRID, tooltipStyle } from "./colors";
import type { DayPoint } from "@/lib/analytics";

export default function OrdersChart({ series, days }: { series: DayPoint[]; days: number }) {
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
