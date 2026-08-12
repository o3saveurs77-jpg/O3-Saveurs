"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { FormuleBuilder } from "./FormuleBuilder";
import { fmtPrice } from "@/lib/menu";
import type { Formula } from "@/lib/menu";
import { isFormulaOrderable } from "@/lib/formulas";

/**
 * Cartes des formules et ouverture de l'assistant.
 *
 * Une formule dont un créneau obligatoire n'a plus aucun plat commandable
 * n'est pas proposée à la composition : mieux vaut le dire ici que de laisser
 * quelqu'un choisir trois plats avant de buter sur le dessert épuisé.
 */
export function FormulesClient({ formulas }: { formulas: Formula[] }) {
  const [open, setOpen] = useState<Formula | null>(null);

  /* Un lien « /formules#F3 » venu de l'accueil ouvre directement la bonne
     formule — le visiteur a déjà choisi, inutile de le faire recommencer. */
  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.replace(/^#/, "")).toUpperCase();
    if (!code) return;
    const target = formulas.find((f) => f.code.toUpperCase() === code);
    if (target && isFormulaOrderable(target)) setOpen(target);
  }, [formulas]);

  if (formulas.length === 0) {
    return (
      <p className="wrap py-16 text-center text-ink-2">
        Aucune formule n'est proposée pour le moment.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {formulas.map((f, i) => {
          const orderable = isFormulaOrderable(f);
          return (
            <Reveal key={f.id} delay={i * 80} className="h-full">
              <article className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lg)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brick font-display text-sm text-white">
                    {f.code}
                  </span>
                  <span className="rounded-full bg-brick px-3.5 py-1.5 font-display text-lg text-white shadow-sm">
                    {fmtPrice(f.priceCents)}
                  </span>
                </div>

                <h3 className="mt-3 text-xl leading-tight">{f.name}</h3>
                <p className="mt-1.5 flex-1 text-sm text-ink-2">{f.desc}</p>

                {f.extra && (
                  <p className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-teal/10 px-3 py-1.5 text-sm font-semibold text-teal">
                    <Icon name="check" size={16} /> {f.extra}
                  </p>
                )}

                <ul className="mt-4 space-y-1 text-sm text-ink-2">
                  {f.slots.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <Icon name="chevron" size={13} className="shrink-0 text-primary" />
                      {s.label}
                      {!s.required && <span className="text-xs">(facultatif)</span>}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={!orderable}
                  onClick={() => setOpen(f)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {orderable ? (
                    <>
                      Choisir cette formule <Icon name="arrow" size={17} />
                    </>
                  ) : (
                    "Indisponible aujourd'hui"
                  )}
                </button>
              </article>
            </Reveal>
          );
        })}
      </div>

      {open && <FormuleBuilder formula={open} onClose={() => setOpen(null)} />}
    </>
  );
}
