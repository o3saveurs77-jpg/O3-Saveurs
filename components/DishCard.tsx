"use client";

import { useState } from "react";
import type { Dish } from "@/lib/menu";
import { fmtPrice } from "@/lib/menu";
import { Icon } from "./Icon";
import { DishBadge } from "./DishBadge";
import { useCart } from "./cart/CartContext";
import { useAuth } from "./providers/AuthContext";
import { DishModal } from "./DishModal";

export function DishCard({ dish }: { dish: Dish }) {
  const { add } = useCart();
  const { user, toggleFavorite } = useAuth();
  const [modal, setModal] = useState(false);
  const isFav = !!user?.favorites.includes(dish.id);

  const soon = dish.badge === "Bientôt" || dish.price == null;
  const epuise = dish.available === false;
  const blocked = soon || epuise;
  const needsChoice = dish.options.length > 0 || (dish.formules?.length ?? 0) > 0;

  const onAdd = () => {
    if (blocked) return;
    if (needsChoice) {
      setModal(true);
    } else {
      add(dish);
    }
  };

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]">
        {/* visuel */}
        <div className="relative aspect-[4/3] overflow-hidden">
          {dish.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dish.photo}
              alt={dish.name}
              className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
                epuise ? "grayscale" : ""
              }`}
              loading="lazy"
            />
          ) : (
            <div className="ph h-full w-full">
              <span className="glyph">{dish.name.split(" ")[0]}</span>
            </div>
          )}

          {epuise && (
            <div className="absolute inset-0 grid place-items-center bg-black/35">
              <span className="rounded-full bg-white px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-brick">
                Épuisé
              </span>
            </div>
          )}

          {/* badges en surimpression */}
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            {dish.popular && <DishBadge kind="Populaire" />}
            {dish.badge && <DishBadge kind={dish.badge} />}
          </div>

          {/* favori (connecté uniquement) */}
          {user && (
            <button
              onClick={() => toggleFavorite(dish.id)}
              className={`absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-white/85 backdrop-blur transition hover:scale-105 ${
                isFav ? "text-brick" : "text-ink-2"
              }`}
              aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <Icon name="heart" size={18} fill={isFav} />
            </button>
          )}
        </div>

        {/* corps */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-[17px] leading-tight">{dish.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink-2">{dish.desc}</p>

          {dish.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dish.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-panel-2 px-2.5 py-1 text-[11px] font-semibold text-ink-2"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* prix + ajout */}
          <div className="mt-4 flex items-center justify-between gap-2 pt-1">
            <span className="text-lg font-extrabold text-brick">
              {dish.price != null ? fmtPrice(dish.price) : "Bientôt"}
            </span>
            <button
              onClick={onAdd}
              disabled={blocked}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
                blocked
                  ? "cursor-not-allowed bg-panel-2 text-ink-2"
                  : "bg-primary text-white hover:brightness-105 active:scale-95"
              }`}
            >
              {epuise ? (
                "Épuisé"
              ) : soon ? (
                "Bientôt"
              ) : (
                <>
                  <Icon name="plus" size={16} />
                  {needsChoice ? "Choisir" : "Ajouter"}
                </>
              )}
            </button>
          </div>
        </div>
      </article>

      {modal && <DishModal dish={dish} onClose={() => setModal(false)} />}
    </>
  );
}
