import Link from "next/link";
import { fmtCents } from "@/lib/money";
import { Icon, type IconName } from "@/components/Icon";
import type { PeriodComparison } from "@/lib/analytics";

/** Le chiffre du jour — CA encaissé, en tête de page. */
export function Today({ period }: { period: PeriodComparison }) {
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
export function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-ink-2">Pas de référence</span>;
  const sign = pct > 0 ? "+" : "";
  return (
    <span className="font-semibold text-ink">
      {sign}
      {pct.toLocaleString("fr-FR")} %
    </span>
  );
}

export function PeriodTile({ period, icon }: { period: PeriodComparison; icon: IconName }) {
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

export function Tile({
  label,
  value,
  icon,
  sub,
  href,
}: {
  label: string;
  value: string;
  icon: IconName;
  sub?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-2">{sub}</p>}
    </>
  );

  if (!href) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      {body}
    </Link>
  );
}
