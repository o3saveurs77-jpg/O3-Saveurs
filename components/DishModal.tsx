"use client";

import { useState } from "react";
import type { Dish } from "@/lib/menu";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "./Icon";
import { useCart } from "./cart/CartContext";

export function DishModal({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const { add } = useCart();

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

  const unitPrice = hasFormules
    ? dish.formules![formuleIdx][1]
    : dish.price ?? 0;
  const formuleLabel = hasFormules ? dish.formules![formuleIdx][0] : null;

  // toutes les options requises sont choisies ?
  const ready = dish.options.every((o) => !o.required || opts[o.name]);

  const confirm = () => {
    if (!ready) return;
    add(dish, { qty, opts, formule: formuleLabel, unitPrice });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-page shadow-[var(--shadow-lg)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* visuel + fermer */}
        <div className="relative">
          {dish.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dish.photo} alt={dish.name} className="h-44 w-full object-cover" />
          ) : (
            <div className="ph h-44 w-full">
              <span className="glyph">{dish.name.split(" ")[0]}</span>
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
            aria-label="Fermer"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* contenu scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 className="text-2xl">{dish.name}</h2>
          <p className="mt-1 text-sm text-ink-2">{dish.desc}</p>

          {/* formules */}
          {hasFormules && (
            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-bold text-ink-2">Formule</legend>
              <div className="flex flex-col gap-2">
                {dish.formules!.map(([label, price], i) => (
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
                      >
                        {formuleIdx === i && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      {label}
                    </span>
                    <span className="font-bold text-brick">{fmtPrice(price)}</span>
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
                      onClick={() => setOpts((s) => ({ ...s, [o.name]: c.l }))}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-line bg-panel hover:border-primary/40"
                      }`}
                    >
                      {c.l}
                      {c.price ? ` +${fmtPrice(c.price)}` : ""}
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
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2"
              aria-label="Moins"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="w-6 text-center font-bold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2"
              aria-label="Plus"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          <button
            onClick={confirm}
            disabled={!ready}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 font-bold transition ${
              ready
                ? "bg-primary text-white hover:brightness-105"
                : "cursor-not-allowed bg-panel-2 text-ink-2"
            }`}
          >
            Ajouter · {fmtPrice(unitPrice * qty)}
          </button>
        </footer>
      </div>
    </div>
  );
}
