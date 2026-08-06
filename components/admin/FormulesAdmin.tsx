"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { cats, fmtPrice } from "@/lib/menu";
import type { Dish, Formula } from "@/lib/menu";

/**
 * Formules — composition et tarif.
 *
 * L'écran est un éditeur complet : en-tête de la formule, créneaux, et pour
 * chaque créneau les plats que la cliente accepte. L'enregistrement envoie la
 * définition entière (`PUT /api/formules/[id]`), qui conserve l'identifiant des
 * créneaux existants pour ne pas invalider les paniers en cours.
 *
 * Les montants sont saisis en euros et convertis en centimes à l'envoi : la
 * base ne connaît que des entiers de centimes.
 */

// ─── Modèle d'édition ─────────────────────────────────────────
// Une copie locale, modifiable, de la formule chargée. On ne touche jamais
// directement l'objet venu du serveur : tant que l'enregistrement n'a pas
// réussi, l'écran doit pouvoir revenir en arrière.

interface DraftChoice {
  dishId: string;
  supplementCents: number;
}

interface DraftSlot {
  /** null pour un créneau qui n'existe pas encore en base */
  id: string | null;
  label: string;
  required: boolean;
  choices: DraftChoice[];
}

interface Draft {
  id: string;
  code: string;
  name: string;
  desc: string;
  extra: string;
  priceCents: number;
  active: boolean;
  slots: DraftSlot[];
}

const toDraft = (f: Formula): Draft => ({
  id: f.id,
  code: f.code,
  name: f.name,
  desc: f.desc,
  extra: f.extra,
  priceCents: f.priceCents,
  active: f.active,
  slots: f.slots.map((s) => ({
    id: s.id,
    label: s.label,
    required: s.required,
    choices: s.choices.map((c) => ({ dishId: c.dishId, supplementCents: c.supplementCents })),
  })),
});

/** Euros saisis → centimes. Tolère la virgule décimale française. */
const toCents = (v: string): number => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

const toEuros = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");

export function FormulesAdmin() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [fRes, dRes] = await Promise.all([
        fetch("/api/formules?all=1", { cache: "no-store" }),
        fetch("/api/dishes", { cache: "no-store" }),
      ]);
      if (!fRes.ok || !dRes.ok) throw new Error();
      const fData = (await fRes.json()) as { formulas: Formula[] };
      const dData = (await dRes.json()) as Dish[];
      setFormulas(fData.formulas);
      setDishes(dData);
      setSelectedId((prev) => prev ?? fData.formulas[0]?.id ?? null);
    } catch {
      setErreur("Les formules n'ont pas pu être chargées.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Le brouillon suit la formule sélectionnée, sans écraser une édition en cours.
  useEffect(() => {
    const found = formulas.find((f) => f.id === selectedId);
    setDraft(found ? toDraft(found) : null);
  }, [selectedId, formulas]);

  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  const dishesByCat = useMemo(() => {
    return cats
      .map((c) => ({ cat: c, list: dishes.filter((d) => d.cat === c.id) }))
      .filter((g) => g.list.length > 0);
  }, [dishes]);

  /** Prix affiché « à partir de » : la formule seule, suppléments en sus. */
  const draftTotalHint = draft
    ? `${fmtPrice(draft.priceCents)} — hors suppléments`
    : "";

  // ─── Mutations du brouillon ─────────────────────────────────

  const patch = (fn: (d: Draft) => Draft) => setDraft((prev) => (prev ? fn(prev) : prev));

  const addSlot = () =>
    patch((d) => ({
      ...d,
      slots: [...d.slots, { id: null, label: "Nouveau créneau", required: true, choices: [] }],
    }));

  const removeSlot = (i: number) =>
    patch((d) => ({ ...d, slots: d.slots.filter((_, k) => k !== i) }));

  const moveSlot = (i: number, dir: -1 | 1) =>
    patch((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.slots.length) return d;
      const slots = [...d.slots];
      [slots[i], slots[j]] = [slots[j], slots[i]];
      return { ...d, slots };
    });

  const patchSlot = (i: number, fn: (s: DraftSlot) => DraftSlot) =>
    patch((d) => ({ ...d, slots: d.slots.map((s, k) => (k === i ? fn(s) : s)) }));

  const toggleDish = (slotIndex: number, dishId: string) =>
    patchSlot(slotIndex, (s) => {
      const exists = s.choices.some((c) => c.dishId === dishId);
      return {
        ...s,
        choices: exists
          ? s.choices.filter((c) => c.dishId !== dishId)
          : [...s.choices, { dishId, supplementCents: 0 }],
      };
    });

  /** Coche ou décoche toute une catégorie d'un coup — le geste le plus fréquent. */
  const toggleCategory = (slotIndex: number, catId: string) =>
    patchSlot(slotIndex, (s) => {
      const inCat = dishes.filter((d) => d.cat === catId).map((d) => d.id);
      const allIn = inCat.every((id) => s.choices.some((c) => c.dishId === id));
      if (allIn) return { ...s, choices: s.choices.filter((c) => !inCat.includes(c.dishId)) };
      const missing = inCat
        .filter((id) => !s.choices.some((c) => c.dishId === id))
        .map((id) => ({ dishId: id, supplementCents: 0 }));
      return { ...s, choices: [...s.choices, ...missing] };
    });

  const setSupplement = (slotIndex: number, dishId: string, euros: string) =>
    patchSlot(slotIndex, (s) => ({
      ...s,
      choices: s.choices.map((c) =>
        c.dishId === dishId ? { ...c, supplementCents: toCents(euros) } : c,
      ),
    }));

  // ─── Enregistrement ─────────────────────────────────────────

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setErreur(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/formules/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          name: draft.name,
          desc: draft.desc,
          extra: draft.extra,
          priceCents: draft.priceCents,
          active: draft.active,
          slots: draft.slots.map((s) => ({
            id: s.id ?? undefined,
            label: s.label,
            required: s.required,
            choices: s.choices,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { formula?: Formula; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error || "L'enregistrement a échoué.");
      setMessage("Formule enregistrée.");
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const creer = async () => {
    setErreur(null);
    const suivant = `F${formulas.length + 1}`;
    try {
      const res = await fetch("/api/formules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: suivant,
          name: "Nouvelle formule",
          desc: "",
          extra: "",
          priceCents: 1000,
          active: false,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { formula?: Formula; error?: string }
        | null;
      if (!res.ok || !data?.formula) throw new Error(data?.error || "Création impossible.");
      await charger();
      setSelectedId(data.formula.id);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Création impossible.");
    }
  };

  const supprimer = async () => {
    if (!draft) return;
    if (!confirm(`Supprimer définitivement la formule « ${draft.name} » ?`)) return;
    setErreur(null);
    try {
      const res = await fetch(`/api/formules/${draft.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSelectedId(null);
      await charger();
    } catch {
      setErreur("La suppression a échoué.");
    }
  };

  // ─── Rendu ──────────────────────────────────────────────────

  if (!ready) return <p className="py-16 text-center text-ink-2">Chargement…</p>;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Formules</h1>
          <p className="mt-1 text-sm text-ink-2">
            {formulas.length} formule{formulas.length > 1 ? "s" : ""} · le client compose la sienne
            depuis la page Formules
          </p>
        </div>
        <button
          type="button"
          onClick={creer}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105"
        >
          <Icon name="plus" size={16} /> Nouvelle formule
        </button>
      </header>

      {erreur && (
        <p role="alert" className="rounded-xl border border-brick/30 bg-primary-soft p-3 text-sm text-brick">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm font-semibold text-teal">
          {message}
        </p>
      )}

      {formulas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-panel py-16 text-center text-ink-2">
          <Icon name="list" size={40} className="opacity-30" />
          <p className="text-lg font-bold text-ink">Aucune formule</p>
          <p className="text-sm">Créez-en une pour la proposer sur la page Formules.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* ── Liste des formules ── */}
          <aside className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {formulas.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedId(f.id)}
                aria-current={f.id === selectedId}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition lg:shrink ${
                  f.id === selectedId
                    ? "border-primary bg-primary-soft"
                    : "border-line bg-panel hover:border-primary/40"
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brick font-display text-xs text-white">
                  {f.code}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{f.name}</span>
                  <span className="block text-xs text-ink-2">
                    {fmtPrice(f.priceCents)}
                    {!f.active && " · masquée"}
                  </span>
                </span>
              </button>
            ))}
          </aside>

          {/* ── Éditeur ── */}
          {draft && (
            <section className="flex flex-col gap-5">
              <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Code" hint="Pastille affichée sur la carte">
                    <input
                      value={draft.code}
                      onChange={(e) => patch((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                      maxLength={8}
                      className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                    />
                  </Champ>
                  <Champ label="Nom">
                    <input
                      value={draft.name}
                      onChange={(e) => patch((d) => ({ ...d, name: e.target.value }))}
                      maxLength={60}
                      className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                    />
                  </Champ>
                  <Champ label="Description" hint="Affichée sous le nom">
                    <input
                      value={draft.desc}
                      onChange={(e) => patch((d) => ({ ...d, desc: e.target.value }))}
                      maxLength={200}
                      placeholder="Entrée + plat au choix + dessert"
                      className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                    />
                  </Champ>
                  <Champ label="Argument" hint="Pastille verte, ex. « Sur le pouce »">
                    <input
                      value={draft.extra}
                      onChange={(e) => patch((d) => ({ ...d, extra: e.target.value }))}
                      maxLength={80}
                      className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                    />
                  </Champ>
                  <Champ label="Prix (€)" hint={draftTotalHint}>
                    <input
                      inputMode="decimal"
                      value={toEuros(draft.priceCents)}
                      onChange={(e) => patch((d) => ({ ...d, priceCents: toCents(e.target.value) }))}
                      className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm"
                    />
                  </Champ>
                  <Champ label="Visibilité">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => patch((d) => ({ ...d, active: e.target.checked }))}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      Proposée sur le site
                    </label>
                  </Champ>
                </div>
              </div>

              {/* ── Créneaux ── */}
              <div className="flex flex-col gap-4">
                {draft.slots.map((slot, i) => {
                  const count = slot.choices.length;
                  return (
                    <div
                      key={slot.id ?? `nouveau-${i}`}
                      className="rounded-[var(--radius-card)] border border-line bg-panel p-5"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          value={slot.label}
                          onChange={(e) =>
                            patchSlot(i, (s) => ({ ...s, label: e.target.value }))
                          }
                          maxLength={60}
                          className="min-w-0 flex-1 rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm font-bold"
                        />
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={slot.required}
                            onChange={(e) =>
                              patchSlot(i, (s) => ({ ...s, required: e.target.checked }))
                            }
                            className="h-4 w-4 accent-[var(--color-primary)]"
                          />
                          Obligatoire
                        </label>
                        <div className="flex shrink-0 items-center gap-1">
                          <BoutonIcone
                            label="Monter"
                            icon="chevron"
                            className="-rotate-90"
                            onClick={() => moveSlot(i, -1)}
                            disabled={i === 0}
                          />
                          <BoutonIcone
                            label="Descendre"
                            icon="chevron"
                            className="rotate-90"
                            onClick={() => moveSlot(i, 1)}
                            disabled={i === draft.slots.length - 1}
                          />
                          <BoutonIcone
                            label="Supprimer le créneau"
                            icon="trash"
                            onClick={() => removeSlot(i)}
                          />
                        </div>
                      </div>

                      <p className="mt-2 text-xs text-ink-2">
                        {count === 0 ? (
                          <span className="font-bold text-brick">
                            Aucun plat : la formule ne pourra pas être commandée.
                          </span>
                        ) : (
                          `${count} plat${count > 1 ? "s" : ""} proposé${count > 1 ? "s" : ""}`
                        )}
                      </p>

                      {/* Plats retenus, avec leur supplément */}
                      {count > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {slot.choices.map((c) => {
                            const dish = dishById.get(c.dishId);
                            return (
                              <li
                                key={c.dishId}
                                className="flex items-center gap-2 rounded-full border border-line bg-panel-2 py-1 pl-3 pr-1 text-sm"
                              >
                                <span className="max-w-[14rem] truncate">
                                  {dish?.name ?? "Plat supprimé"}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-ink-2">
                                  +
                                  <input
                                    inputMode="decimal"
                                    value={toEuros(c.supplementCents)}
                                    onChange={(e) => setSupplement(i, c.dishId, e.target.value)}
                                    aria-label={`Supplément pour ${dish?.name ?? "ce plat"}`}
                                    className="w-14 rounded-md border border-line bg-panel px-1.5 py-0.5 text-right"
                                  />
                                  €
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleDish(i, c.dishId)}
                                  aria-label={`Retirer ${dish?.name ?? "ce plat"}`}
                                  className="grid h-6 w-6 place-items-center rounded-full text-ink-2 transition hover:bg-line hover:text-brick"
                                >
                                  <Icon name="x" size={13} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Catalogue : cocher les plats acceptés dans ce créneau */}
                      <details className="mt-4 rounded-xl border border-line bg-panel-2 p-3">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Choisir les plats de ce créneau
                        </summary>
                        <div className="mt-3 flex flex-col gap-4">
                          {dishesByCat.map(({ cat, list }) => {
                            const allIn = list.every((d) =>
                              slot.choices.some((c) => c.dishId === d.id),
                            );
                            return (
                              <div key={cat.id}>
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold uppercase tracking-wide text-ink-2">
                                    {cat.label}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => toggleCategory(i, cat.id)}
                                    className="text-xs font-semibold text-primary hover:underline"
                                  >
                                    {allIn ? "Tout retirer" : "Tout ajouter"}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {list.map((d) => {
                                    const active = slot.choices.some((c) => c.dishId === d.id);
                                    return (
                                      <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => toggleDish(i, d.id)}
                                        aria-pressed={active}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                          active
                                            ? "border-primary bg-primary text-white"
                                            : "border-line bg-panel hover:border-primary/40"
                                        }`}
                                      >
                                        {d.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addSlot}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-dashed border-line py-3 text-sm font-semibold text-ink-2 transition hover:border-primary/50 hover:text-primary"
                >
                  <Icon name="plus" size={16} /> Ajouter un créneau
                </button>
              </div>

              {/* ── Barre d'actions ── */}
              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-lg)]">
                <button
                  type="button"
                  onClick={supprimer}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 transition hover:text-brick"
                >
                  <Icon name="trash" size={15} /> Supprimer
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Champ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

function BoutonIcone({
  label,
  icon,
  onClick,
  disabled,
  className = "",
}: {
  label: string;
  icon: "chevron" | "trash";
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full border border-line bg-panel transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={15} className={className} />
    </button>
  );
}
