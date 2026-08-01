import { fmtCents } from "@/lib/money";
import { Card } from "./Card";
import type { StageDelay, StatsResponse } from "@/lib/analytics";

export function Delays({
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
