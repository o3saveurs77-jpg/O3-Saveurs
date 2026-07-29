"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "./CartContext";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/menu";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CartDrawer() {
  const { open } = useCart();
  // Le tiroir était **toujours monté** et seulement translaté hors écran : ses
  // boutons restaient focusables au clavier sur chaque page du site. Il n'est
  // désormais dans le DOM que lorsqu'il est ouvert.
  if (!open) return null;
  return <Drawer />;
}

function Drawer() {
  const { lines, setOpen, subtotalCents, count, setQty, remove } = useCart();
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
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
  }, [setOpen]);

  return (
    <>
      {/* overlay */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[90] bg-black/40"
        aria-hidden="true"
      />

      {/* panneau */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        /* `h-dvh` et non `h-full` : sur mobile, la barre d'adresse du navigateur
           est comprise dans la hauteur de fenêtre classique, si bien que le pied
           du tiroir — sous-total et bouton « Commander » — se retrouvait
           dessous, hors d'atteinte. L'unité dynamique suit la zone réellement
           visible. */
        className="fixed right-0 top-0 z-[100] flex h-dvh w-full max-w-[420px] flex-col bg-page shadow-[var(--shadow-lg)] outline-none"
      >
        {/* en-tête */}
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Icon name="bag" size={22} className="text-primary" />
            <h2 id={titleId} className="text-lg">
              Votre panier
            </h2>
            {count > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2"
            aria-label="Fermer le panier"
          >
            <Icon name="x" size={20} />
          </button>
        </header>

        {/* lignes */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-ink-2">
              <Icon name="bag" size={48} className="opacity-30" />
              <p className="font-semibold">Votre panier est vide</p>
              <p className="text-sm">Ajoutez vos plats préférés depuis la carte.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((l) => (
                <li
                  key={l.key}
                  className="flex gap-3 rounded-[var(--radius-soft)] border border-line bg-panel p-3"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                    {l.photo ? (
                      <Image
                        src={l.photo}
                        alt={l.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="ph h-full w-full">
                        <span className="glyph text-2xl">Ô3</span>
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-bold leading-tight">{l.name}</p>
                      <button
                        type="button"
                        onClick={() => remove(l.key)}
                        className="-m-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:text-brick"
                        aria-label={`Retirer ${l.name} du panier`}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                    {l.formule && <p className="text-xs text-ink-2">{l.formule}</p>}
                    {Object.entries(l.opts).length > 0 && (
                      <p className="truncate text-xs text-ink-2">
                        {Object.values(l.opts).join(" · ")}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                      {/* 28 px de côté au doigt : sous le minimum de 44 px des
                          recommandations tactiles, et le − / + se manquait une
                          fois sur deux. Le pointeur fin garde la taille
                          compacte d'origine. */}
                      <div className="flex items-center gap-1 rounded-full border border-line">
                        <button
                          type="button"
                          onClick={() => setQty(l.key, l.qty - 1)}
                          className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2 sm:h-7 sm:w-7"
                          aria-label={`Diminuer la quantité de ${l.name}`}
                        >
                          <Icon name="minus" size={14} />
                        </button>
                        <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(l.key, l.qty + 1)}
                          className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2 sm:h-7 sm:w-7"
                          aria-label={`Augmenter la quantité de ${l.name}`}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                      <span className="font-bold text-brick">
                        {fmtPrice(l.unitPriceCents * l.qty)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* pied */}
        {lines.length > 0 && (
          <footer className="border-t border-line px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-ink-2">Sous-total</span>
              <span className="text-xl font-extrabold">{fmtPrice(subtotalCents)}</span>
            </div>
            <Link
              href="/commander"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-bold text-white transition hover:brightness-105"
            >
              Commander
              <Icon name="arrow" size={18} />
            </Link>
            <p className="mt-2 text-center text-xs text-ink-2">
              Frais de livraison & minimum calculés à l'étape suivante.
            </p>
          </footer>
        )}
      </aside>
    </>
  );
}
