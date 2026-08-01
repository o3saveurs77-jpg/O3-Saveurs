"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { fmtCents } from "@/lib/money";
import { Card } from "./Card";
import { SERIES, AXIS, GRID, tooltipStyle } from "./colors";
import type { StatsResponse } from "@/lib/analytics";

export default function TopDishes({ dishes, days }: { dishes: StatsResponse["topDishes"]; days: number }) {
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
