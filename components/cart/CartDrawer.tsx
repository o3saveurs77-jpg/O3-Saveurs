"use client";

import Link from "next/link";
import { useCart } from "./CartContext";
import { Icon } from "@/components/Icon";
import { fmtPrice } from "@/lib/menu";

export function CartDrawer() {
  const { lines, open, setOpen, subtotal, count, setQty, remove } = useCart();

  return (
    <>
      {/* overlay */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[90] bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
      />

      {/* panneau */}
      <aside
        className={`fixed right-0 top-0 z-[100] flex h-full w-full max-w-[420px] flex-col bg-page shadow-[var(--shadow-lg)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Panier"
      >
        {/* en-tête */}
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Icon name="bag" size={22} className="text-primary" />
            <h2 className="text-lg">Votre panier</h2>
            {count > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel-2"
            aria-label="Fermer"
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
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                    {l.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.photo} alt={l.name} className="h-full w-full object-cover" />
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
                        onClick={() => remove(l.key)}
                        className="text-ink-2 hover:text-brick"
                        aria-label="Retirer"
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

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1 rounded-full border border-line">
                        <button
                          onClick={() => setQty(l.key, l.qty - 1)}
                          className="grid h-7 w-7 place-items-center rounded-full hover:bg-panel-2"
                          aria-label="Moins"
                        >
                          <Icon name="minus" size={14} />
                        </button>
                        <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
                        <button
                          onClick={() => setQty(l.key, l.qty + 1)}
                          className="grid h-7 w-7 place-items-center rounded-full hover:bg-panel-2"
                          aria-label="Plus"
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                      <span className="font-bold text-brick">
                        {fmtPrice(l.unitPrice * l.qty)}
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
              <span className="text-xl font-extrabold">{fmtPrice(subtotal)}</span>
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
