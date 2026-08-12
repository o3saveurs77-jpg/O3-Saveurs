"use client";

import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/menu";
import { buildCalendar, emptyDays, type SpecialEntry } from "@/lib/dailySpecialCalendar";

/**
 * Calendrier du plat du jour, quatre semaines devant.
 *
 * La liste des plats du jour disait ce qui existe, jamais ce qui manque : un
 * jeudi sans plat ne se remarquait que le jeudi, quand l'encart disparaissait
 * de l'accueil. Le calendrier montre les trous d'abord.
 *
 * Il rejoue la règle du site — une date précise l'emporte sur la récurrence
 * hebdomadaire — pour ne jamais annoncer autre chose que ce qui sera affiché.
 */

const jourFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "short",
  day: "numeric",
});

export function PlatDuJourCalendrier({
  entries,
  onPickDate,
}: {
  entries: SpecialEntry[];
  /** Ouvre le formulaire pré-rempli sur ce jour (`YYYY-MM-DD`). */
  onPickDate: (isoDate: string) => void;
}) {
  const { calendar, trous } = useMemo(() => {
    /* Minuit à Paris pour aujourd'hui. `sv-SE` donne « 2026-08-10 », le seul
     * format que `Date.parse` interprète sans ambiguïté de fuseau. */
    const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
    const from = Date.parse(`${iso}T00:00:00Z`);
    const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();

    const cal = buildCalendar(entries, from, weekday, 28);
    return { calendar: cal, trous: emptyDays(cal) };
  }, [entries]);

  const isoOf = (at: number) => new Date(at).toISOString().slice(0, 10);

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">Les quatre prochaines semaines</h2>
        {trous.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-sm font-semibold text-teal">
            <Icon name="check" size={15} /> Aucun jour sans plat
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-3 py-1 text-sm font-bold text-[#7a5f00]">
            <Icon name="warning" size={15} /> {trous.length} jour{trous.length > 1 ? "s" : ""} sans
            plat
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {calendar.map((d, i) => {
          const vide = d.entry === null;
          const aujourdhui = i === 0;

          return (
            <button
              key={d.at}
              type="button"
              onClick={() => onPickDate(isoOf(d.at))}
              title={
                vide
                  ? "Programmer un plat ce jour-là"
                  : d.source === "date"
                    ? "Plat fixé pour cette date"
                    : "Vient de la récurrence hebdomadaire"
              }
              className={`flex min-h-[86px] flex-col rounded-xl border p-2.5 text-left transition hover:border-primary ${
                vide ? "border-dashed border-gold/60 bg-gold/5" : "border-line bg-page"
              } ${aujourdhui ? "ring-2 ring-primary" : ""}`}
            >
              <span className="text-xs font-bold uppercase text-ink-2">
                {jourFmt.format(new Date(d.at))}
                {aujourdhui && <span className="text-primary"> · auj.</span>}
              </span>

              {vide ? (
                <span className="mt-auto text-xs font-semibold text-[#7a5f00]">
                  — à programmer
                </span>
              ) : (
                <>
                  <span className="mt-1 line-clamp-2 text-sm font-semibold leading-tight">
                    {d.entry!.name}
                  </span>
                  <span className="mt-auto flex items-center gap-1 text-[11px] text-ink-2">
                    {d.entry!.priceCents !== null && fmtPrice(d.entry!.priceCents)}
                    {/* Distinguer l'exception de la routine : sans ce repère on
                        ne sait pas si modifier le lundi touche un seul jour ou
                        tous les lundis. */}
                    {d.source === "date" ? (
                      <span className="rounded-full bg-primary-soft px-1.5 font-bold text-brick">
                        ce jour
                      </span>
                    ) : (
                      <span className="rounded-full bg-panel-2 px-1.5">chaque semaine</span>
                    )}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-ink-2">
        Cliquez un jour pour y programmer un plat. Un plat fixé sur une date remplace la récurrence
        de la semaine, ce jour-là seulement.
      </p>
    </section>
  );
}
