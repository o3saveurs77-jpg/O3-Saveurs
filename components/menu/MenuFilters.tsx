"use client";

import { cats } from "@/lib/menu";
import { ALLERGEN_LABEL } from "@/lib/types";
import type { Allergen } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/menu";

export type SortKey = "menu" | "price-asc" | "price-desc";

export interface FiltersState {
  badges: Set<string>;
  excluded: Set<Allergen>;
  maxPriceCents: number | null;
  hideUnavailable: boolean;
  sort: SortKey;
}

export const EMPTY_FILTERS: FiltersState = {
  badges: new Set(),
  excluded: new Set(),
  maxPriceCents: null,
  hideUnavailable: false,
  sort: "menu",
};

/** Nombre de critères actifs — sert la pastille du bouton « Filtres » en mobile. */
export function countActive(f: FiltersState): number {
  return (
    f.badges.size +
    f.excluded.size +
    (f.maxPriceCents !== null ? 1 : 0) +
    (f.hideUnavailable ? 1 : 0) +
    (f.sort !== "menu" ? 1 : 0)
  );
}

const BADGES = [
  { k: "popular", label: "Populaires", icon: "star" as const },
  { k: "Healthy", label: "Healthy", icon: "leaf" as const },
  { k: "Nouveau", label: "Nouveau", icon: "sparkle" as const },
];

const SORTS: { k: SortKey; label: string }[] = [
  { k: "menu", label: "Ordre de la carte" },
  { k: "price-asc", label: "Prix croissant" },
  { k: "price-desc", label: "Prix décroissant" },
];

/**
 * Panneau de filtres — partagé par la colonne latérale (bureau) et le tiroir
 * (mobile), pour qu'un critère ajouté n'existe qu'à un seul endroit.
 *
 * `counts` porte le nombre de plats par catégorie *après* filtrage : une
 * catégorie vidée par les critères en cours est affichée grisée plutôt que
 * masquée, sinon la liste sauterait sous le doigt à chaque changement.
 */
export function MenuFilters({
  state,
  onChange,
  counts,
  activeCat,
  onPickCat,
  priceBounds,
  allergens,
}: {
  state: FiltersState;
  onChange: (next: FiltersState) => void;
  counts: Record<string, number>;
  activeCat: string;
  onPickCat: (id: string) => void;
  priceBounds: { min: number; max: number };
  allergens: Allergen[];
}) {
  const set = (patch: Partial<FiltersState>) => onChange({ ...state, ...patch });

  const toggleIn = <T,>(s: Set<T>, v: T) => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const active = countActive(state);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Catégories ─────────────────────────────────── */}
      <nav aria-label="Catégories de la carte">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-ink-2">Catégories</h3>
        <ul className="flex flex-col gap-0.5">
          {cats.map((c) => {
            const n = counts[c.id] ?? 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPickCat(c.id)}
                  disabled={n === 0}
                  aria-current={activeCat === c.id ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-soft)] px-3 py-2 text-left text-sm font-semibold transition ${
                    n === 0
                      ? "cursor-not-allowed text-ink-2/40"
                      : activeCat === c.id
                        ? "bg-brick text-white"
                        : "text-ink-2 hover:bg-panel-2 hover:text-ink"
                  }`}
                >
                  <span>{c.label}</span>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      activeCat === c.id ? "text-white/75" : "text-ink-2/70"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Mises en avant ─────────────────────────────── */}
      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-ink-2">Sélection</h3>
        <div className="flex flex-wrap gap-2">
          {BADGES.map((b) => {
            const on = state.badges.has(b.k);
            return (
              <button
                key={b.k}
                type="button"
                onClick={() => set({ badges: toggleIn(state.badges, b.k) })}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  on
                    ? "bg-primary text-white"
                    : "border border-line bg-panel text-ink hover:bg-panel-2"
                }`}
              >
                <Icon name={b.icon} size={14} fill={on} />
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Prix ───────────────────────────────────────── */}
      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-2">Prix maximum</h3>
          <span className="font-display text-sm text-brick">
            {state.maxPriceCents === null ? "Tous" : fmtPrice(state.maxPriceCents)}
          </span>
        </div>
        <label htmlFor="menu-price" className="sr-only">
          Prix maximum
        </label>
        <input
          id="menu-price"
          type="range"
          min={priceBounds.min}
          max={priceBounds.max}
          step={50}
          value={state.maxPriceCents ?? priceBounds.max}
          onChange={(e) => {
            const v = Number(e.target.value);
            // Curseur au maximum = pas de plafond, plutôt qu'un filtre inutile.
            set({ maxPriceCents: v >= priceBounds.max ? null : v });
          }}
          className="w-full accent-[var(--color-primary)]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-ink-2">
          <span>{fmtPrice(priceBounds.min)}</span>
          <span>{fmtPrice(priceBounds.max)}</span>
        </div>
      </div>

      {/* ── Allergènes ─────────────────────────────────────
          Le règlement UE 1169/2011 impose de *déclarer* les allergènes ; les
          exclure d'un geste est ce qui rend l'information utilisable quand on
          commande pour quelqu'un qui ne peut pas en manger. */}
      {allergens.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-2">
            Sans ces allergènes
          </h3>
          <p className="mb-2.5 text-[11px] leading-snug text-ink-2">
            Masque les plats qui en contiennent. En cas d'allergie, confirmez toujours par
            téléphone.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allergens.map((a) => {
              const on = state.excluded.has(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => set({ excluded: toggleIn(state.excluded, a) })}
                  aria-pressed={on}
                  className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                    on ? "bg-brick text-white" : "bg-panel-2 text-ink-2 hover:text-ink"
                  }`}
                >
                  {on && "✕ "}
                  {ALLERGEN_LABEL[a]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Disponibilité & tri ────────────────────────── */}
      <div className="flex flex-col gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={state.hideUnavailable}
            onChange={(e) => set({ hideUnavailable: e.target.checked })}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Masquer les plats épuisés
        </label>

        <div>
          <label
            htmlFor="menu-sort"
            className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-2"
          >
            Trier par
          </label>
          <select
            id="menu-sort"
            value={state.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
            className="w-full rounded-[var(--radius-soft)] border border-line bg-panel px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
          >
            {SORTS.map((s) => (
              <option key={s.k} value={s.k}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-bold text-brick transition hover:bg-panel-2"
        >
          <Icon name="refresh" size={15} /> Tout réinitialiser ({active})
        </button>
      )}
    </div>
  );
}
