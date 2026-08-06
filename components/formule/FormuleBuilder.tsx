"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/Icon";
import { DishPlaceholder } from "@/components/DishPlaceholder";
import { useCartActions } from "@/components/cart/CartContext";
import { fmtPrice, isOrderable } from "@/lib/menu";
import type { Dish, Formula, FormulaSlot } from "@/lib/menu";
import type { FormulaPick } from "@/lib/types";

/**
 * Assistant de composition d'une formule : un créneau à la fois, un bouton
 * « Choisir » par plat.
 *
 * Le montant affiché ici est **indicatif**. Il reproduit la règle du serveur
 * (prix de la formule + supplément du plat + suppléments d'options) pour que le
 * client sache où il va, mais c'est `lib/formulas.ts` qui facture — le panier
 * n'envoie que des identifiants.
 */

interface Props {
  formula: Formula;
  onClose: () => void;
}

/** Choix en cours pour un créneau. */
interface Draft {
  dishId: string;
  opts: Record<string, string>;
}

export function FormuleBuilder({ formula, onClose }: Props) {
  const { addFormula } = useCartActions();
  const panelRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Record<string, Draft>>({});

  const slots = formula.slots;
  const slot: FormulaSlot | undefined = slots[step];

  // Fermeture au clavier + focus dans le panneau, comme la fiche plat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Le corps ne défile plus derrière la fenêtre ouverte.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /** Plats réellement proposables d'un créneau (les épuisés restent visibles, grisés). */
  const choicesOf = (s: FormulaSlot) => s.choices.filter((c) => c.dish);

  const supplementOf = (slotId: string, dishId: string): number => {
    const s = slots.find((x) => x.id === slotId);
    return s?.choices.find((c) => c.dishId === dishId)?.supplementCents ?? 0;
  };

  const dishOf = (slotId: string, dishId: string): Dish | undefined =>
    slots.find((x) => x.id === slotId)?.choices.find((c) => c.dishId === dishId)?.dish;

  /* Total indicatif : prix de la formule, plus les suppléments des plats
   * retenus et de leurs options. Même règle que `priceFormula` côté serveur. */
  const totalCents = useMemo(() => {
    let sum = formula.priceCents;
    for (const [slotId, pick] of Object.entries(draft)) {
      sum += supplementOf(slotId, pick.dishId);
      const dish = dishOf(slotId, pick.dishId);
      for (const option of dish?.options ?? []) {
        const chosen = pick.opts[option.name];
        if (!chosen) continue;
        sum += option.choices.find((c) => c.l === chosen)?.priceCents ?? 0;
      }
    }
    return sum;
  }, [draft, formula]);

  /** Un créneau est réglé quand son plat est choisi et ses options obligatoires aussi. */
  const slotDone = (s: FormulaSlot): boolean => {
    const pick = draft[s.id];
    if (!pick) return !s.required;
    const dish = dishOf(s.id, pick.dishId);
    if (!dish) return false;
    return dish.options.every((o) => !o.required || Boolean(pick.opts[o.name]));
  };

  const ready = slots.every(slotDone);
  const lastStep = step >= slots.length - 1;

  /** Sélectionne un plat et pré-remplit ses options à un seul choix. */
  const choose = (s: FormulaSlot, dish: Dish) => {
    setDraft((prev) => ({
      ...prev,
      [s.id]: {
        dishId: dish.id,
        opts: Object.fromEntries(
          dish.options
            .filter((o) => o.required && o.choices.length === 1)
            .map((o) => [o.name, o.choices[0].l]),
        ),
      },
    }));
  };

  const setOption = (slotId: string, optionName: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], opts: { ...prev[slotId].opts, [optionName]: value } },
    }));
  };

  const confirm = () => {
    if (!ready) return;

    const picks: FormulaPick[] = [];
    const opts: Record<string, string> = {};

    for (const s of slots) {
      const pick = draft[s.id];
      if (!pick) continue;
      const dish = dishOf(s.id, pick.dishId);
      if (!dish) continue;

      const optionExtras = dish.options.reduce((sum, o) => {
        const chosen = pick.opts[o.name];
        if (!chosen) return sum;
        return sum + (o.choices.find((c) => c.l === chosen)?.priceCents ?? 0);
      }, 0);
      const supplement = supplementOf(s.id, dish.id) + optionExtras;

      picks.push({
        slotId: s.id,
        slotLabel: s.label,
        dishId: dish.id,
        dishName: dish.name,
        supplementCents: supplement,
        opts: pick.opts,
      });

      const details = Object.values(pick.opts).filter(Boolean);
      const base = [dish.name, ...details].join(" · ");
      opts[s.label] = supplement > 0 ? `${base} (+${fmtPrice(supplement)})` : base;
    }

    addFormula({
      formulaId: formula.id,
      code: formula.code,
      name: formula.name,
      photo: picks.map((p) => dishOf(p.slotId, p.dishId)?.photo).find(Boolean) ?? null,
      picks,
      opts,
      unitPriceCents: totalCents,
    });
    onClose();
  };

  const current = slot ? draft[slot.id] : undefined;
  const currentDish = slot && current ? dishOf(slot.id, current.dishId) : undefined;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Composer la formule ${formula.name}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Fermer"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-page shadow-[var(--shadow-lg)] outline-none sm:max-h-[88vh] sm:rounded-[var(--radius-card)]"
      >
        {/* ── En-tête ── */}
        <header className="flex items-start gap-3 border-b border-line bg-panel px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brick font-display text-sm text-white">
            {formula.code}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl leading-tight">Formule {formula.name}</h2>
            <p className="mt-0.5 truncate text-sm text-ink-2">{formula.desc}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel-2 transition hover:bg-line"
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        {/* ── Fil des créneaux ── */}
        <nav className="no-scrollbar flex gap-2 overflow-x-auto border-b border-line bg-panel-2 px-5 py-3">
          {slots.map((s, i) => {
            const done = slotDone(s) && Boolean(draft[s.id]);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  i === step
                    ? "bg-primary text-white"
                    : done
                      ? "border border-teal/40 bg-teal/10 text-teal"
                      : "border border-line bg-panel text-ink-2 hover:border-primary/40"
                }`}
              >
                {done && i !== step && <Icon name="check" size={14} />}
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* ── Choix du créneau courant ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!slot ? (
            <p className="py-16 text-center text-ink-2">Cette formule n'a aucun créneau.</p>
          ) : (
            <>
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h3 className="text-lg">{slot.label}</h3>
                <span className="text-sm text-ink-2">
                  {slot.required ? "Obligatoire" : "Facultatif"}
                </span>
              </div>

              {choicesOf(slot).length === 0 ? (
                <p className="rounded-xl border border-line bg-panel-2 p-4 text-sm text-ink-2">
                  Aucun plat n'est proposé dans ce créneau pour l'instant.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {choicesOf(slot).map((choice) => {
                    const dish = choice.dish!;
                    const selected = current?.dishId === dish.id;
                    const dispo = isOrderable(dish);

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={!dispo}
                        onClick={() => choose(slot, dish)}
                        aria-pressed={selected}
                        className={`flex items-center gap-3 rounded-[var(--radius-card)] border p-3 text-left transition ${
                          selected
                            ? "border-primary bg-primary-soft"
                            : "border-line bg-panel hover:border-primary/40"
                        } ${dispo ? "" : "cursor-not-allowed opacity-45"}`}
                      >
                        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                          {dish.photo ? (
                            <Image
                              src={dish.photo}
                              alt=""
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : (
                            <DishPlaceholder cat={dish.cat} name={dish.name} />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-bold">{dish.name}</span>
                            {choice.supplementCents > 0 && (
                              <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-xs font-bold text-[#7a5f00]">
                                +{fmtPrice(choice.supplementCents)}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-ink-2">
                            {dispo ? dish.desc : "Épuisé pour le moment"}
                          </span>
                        </span>

                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                            selected ? "border-primary bg-primary text-white" : "border-line"
                          }`}
                          aria-hidden="true"
                        >
                          {selected && <Icon name="check" size={13} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Options du plat retenu (riz, sauce…) : la cuisine a besoin du
                  détail, et certaines options portent un supplément. */}
              {currentDish && currentDish.options.length > 0 && (
                <div className="mt-6 space-y-5 rounded-[var(--radius-card)] border border-line bg-panel-2 p-4">
                  {currentDish.options.map((option) => (
                    <fieldset key={option.name}>
                      <legend className="mb-2 text-sm font-bold text-ink-2">
                        {option.name}
                        {option.required && <span className="text-primary"> ·&nbsp;requis</span>}
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {option.choices.map((c) => {
                          const active = current?.opts[option.name] === c.l;
                          return (
                            <button
                              key={c.l}
                              type="button"
                              onClick={() => setOption(slot.id, option.name, c.l)}
                              aria-pressed={active}
                              className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                                active
                                  ? "border-primary bg-primary text-white"
                                  : "border-line bg-panel hover:border-primary/40"
                              }`}
                            >
                              {c.l}
                              {c.priceCents ? ` +${fmtPrice(c.priceCents)}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Pied : total et navigation ── */}
        <footer className="border-t border-line bg-panel px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ink-2">Total de la formule</p>
              <p className="font-display text-2xl text-brick">{fmtPrice(totalCents)}</p>
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-full border border-line px-4 py-3 font-semibold transition hover:bg-panel-2"
                >
                  Retour
                </button>
              )}

              {!lastStep ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={slot ? !slotDone(slot) : true}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continuer <Icon name="arrow" size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!ready}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="cart" size={17} /> Ajouter au panier
                </button>
              )}
            </div>
          </div>

          {!ready && lastStep && (
            <p className="mt-2 text-right text-xs text-ink-2">
              Il reste un choix à faire :{" "}
              {slots.find((s) => !slotDone(s))?.label.toLowerCase() ?? "un créneau"}.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
