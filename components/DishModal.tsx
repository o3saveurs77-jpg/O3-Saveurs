"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Dish } from "@/lib/menu";
import { fmtPrice, isOrderable } from "@/lib/menu";
import { ALLERGEN_LABEL } from "@/lib/types";
import { Icon } from "./Icon";
import { useCartActions } from "./cart/CartContext";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DishModal({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const { add } = useCartActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // formule sélectionnée (index) ; défaut = première
  const hasFormules = (dish.formules?.length ?? 0) > 0;
  const [formuleIdx, setFormuleIdx] = useState(0);

  // choix d'options : { [optionName]: choiceLabel }
  const [opts, setOpts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    dish.options.forEach((o) => {
      if (o.required && o.choices[0]) init[o.name] = o.choices[0].l;
    });
    return init;
  });
  const [qty, setQty] = useState(1);

  /* ── Prix unitaire ──
   * Doit correspondre **exactement** à `unitPriceOf()` de `lib/pricing.ts`, qui
   * est la seule autorité : prix de base (ou prix de la formule choisie) PLUS
   * les suppléments des options sélectionnées. Les suppléments étaient affichés
   * « +1,00 € » sans jamais être ajoutés — l'écran annonçait donc un total
   * inférieur à celui que le serveur facture. */
  const unitPriceCents = useMemo(() => {
    const base = hasFormules ? dish.formules![formuleIdx][1] : dish.priceCents ?? 0;
    const extras = dish.options.reduce((sum, option) => {
      const chosen = opts[option.name];
      if (!chosen) return sum;
      const choice = option.choices.find((c) => c.l === chosen);
      return sum + (choice?.priceCents ?? 0);
    }, 0);
    return base + extras;
  }, [dish, hasFormules, formuleIdx, opts]);

  const formuleLabel = hasFormules ? dish.formules![formuleIdx][0] : null;

  // toutes les options requises sont choisies ?
  const orderable = isOrderable(dish);
  const ready = orderable && dish.options.every((o) => !o.required || opts[o.name]);
  const maxQty = dish.stock ?? 50;

  /* ── Accessibilité de la boîte de dialogue ──
   * Échap, piège à focus, restitution du focus au déclencheur et blocage du
   * défilement de fond : rien de tout cela n'existait, la fiche plat était
   * inutilisable au clavier et au lecteur d'écran. */
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // premier élément focusable du panneau, sinon le panneau lui-même
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstNode || active === panelRef.current)) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && active === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      trigger?.focus?.();
    };
  }, [onClose]);

  const confirm = () => {
    if (!ready) return;
    add(dish, { qty, opts, formule: formuleLabel, unitPriceCents });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-page shadow-[var(--shadow-lg)] outline-none sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* visuel + fermer */}
        <div className="relative h-44 w-full shrink-0">
          {dish.photo ? (
            <Image
              src={dish.photo}
              alt={dish.name}
              fill
              sizes="(max-width: 640px) 100vw, 448px"
              className="object-cover"
            />
          ) : (
            <div className="ph h-full w-full">
              <span className="glyph">{dish.name.split(" ")[0]}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
            aria-label="Fermer"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* contenu scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 id={titleId} className="text-2xl">
            {dish.name}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{dish.desc}</p>

          {/* stock */}
          {dish.stock !== null && dish.stock > 0 && dish.stock <= 5 && (
            <p className="mt-2 text-sm font-semibold text-brick">
              Plus que {dish.stock} en stock
            </p>
          )}
          {!orderable && (
            <p className="mt-2 text-sm font-semibold text-brick">
              Ce plat n'est pas disponible pour le moment.
            </p>
          )}

          {/* allergènes — obligation d'information avant l'achat (règlement INCO) */}
          <div className="mt-4 rounded-xl border border-line bg-panel p-3">
            <h3 className="text-sm font-bold">Allergènes</h3>
            {dish.allergens.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {dish.allergens.map((a) => (
                  <li
                    key={a}
                    className="rounded-full bg-panel-2 px-2.5 py-1 text-[11px] font-semibold text-ink-2"
                  >
                    {ALLERGEN_LABEL[a]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-2">
                Aucun allergène majeur déclaré pour ce plat.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-2">
              Une question sur les allergènes ? Appelez-nous avant de commander.
            </p>
          </div>

          {/* formules */}
          {hasFormules && (
            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-bold text-ink-2">Formule</legend>
              <div className="flex flex-col gap-2">
                {dish.formules!.map(([label, priceCents], i) => (
                  <label
                    key={label}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
                      formuleIdx === i
                        ? "border-primary bg-primary-soft"
                        : "border-line bg-panel hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 font-semibold">
                      <span
                        className={`grid h-4 w-4 place-items-center rounded-full border-2 ${
                          formuleIdx === i ? "border-primary" : "border-line"
                        }`}
                        aria-hidden="true"
                      >
                        {formuleIdx === i && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      {label}
                    </span>
                    <span className="font-bold text-brick">{fmtPrice(priceCents)}</span>
                    <input
                      type="radio"
                      name="formule"
                      className="sr-only"
                      checked={formuleIdx === i}
                      onChange={() => setFormuleIdx(i)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* options */}
          {dish.options.map((o) => (
            <fieldset key={o.name} className="mt-5">
              <legend className="mb-2 text-sm font-bold text-ink-2">
                {o.name}
                {o.required && <span className="text-primary"> *</span>}
              </legend>
              <div className="flex flex-wrap gap-2">
                {o.choices.map((c) => {
                  const selected = opts[o.name] === c.l;
                  return (
                    <button
                      key={c.l}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setOpts((s) => ({ ...s, [o.name]: c.l }))}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected
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

        {/* pied : quantité + ajout */}
        <footer className="flex items-center gap-3 border-t border-line px-5 py-4">
          <div className="flex items-center gap-1 rounded-full border border-line">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2"
              aria-label="Diminuer la quantité"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="w-6 text-center font-bold" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2"
              aria-label="Augmenter la quantité"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 font-bold transition ${
              ready
                ? "bg-primary text-white hover:brightness-105"
                : "cursor-not-allowed bg-panel-2 text-ink-2"
            }`}
          >
            Ajouter · {fmtPrice(unitPriceCents * qty)}
          </button>
        </footer>
      </div>
    </div>
  );
}
