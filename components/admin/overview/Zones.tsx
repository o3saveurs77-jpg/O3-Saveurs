import { fmtCents } from "@/lib/money";
import { Card } from "./Card";
import { SERIES } from "./colors";
import type { ZoneSplit, StatsResponse } from "@/lib/analytics";

export function Zones({
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
