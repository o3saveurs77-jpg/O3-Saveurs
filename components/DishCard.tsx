"use client";

import { useState } from "react";
import Image from "next/image";
import type { Dish } from "@/lib/menu";
import { fmtPrice, isOrderable } from "@/lib/menu";
import { ALLERGEN_LABEL } from "@/lib/types";
import { Icon } from "./Icon";
import { DishBadge } from "./DishBadge";
import { DishPlaceholder } from "./DishPlaceholder";
import { useCartActions } from "./cart/CartContext";
import { useAuth } from "./providers/AuthContext";
import { DishModal } from "./DishModal";

/** Seuil d'affichage de « Plus que N » quand le plat n'a pas son propre seuil. */
const LOW_STOCK_DEFAULT = 5;

export function DishCard({ dish, priority = false }: { dish: Dish; priority?: boolean }) {
  const { add } = useCartActions();
  const { user, toggleFavorite } = useAuth();
  const [modal, setModal] = useState(false);
  const isFav = !!user?.favorites.includes(dish.id);

  const soon = dish.badge === "Bientôt" || dish.priceCents === null;
  const epuise = !soon && !isOrderable(dish);
  const blocked = soon || epuise;
  const needsChoice = dish.options.length > 0 || (dish.formules?.length ?? 0) > 0;

  const lowStockThreshold = dish.stockAlert ?? LOW_STOCK_DEFAULT;
  const lowStock =
    !blocked && dish.stock !== null && dish.stock > 0 && dish.stock <= lowStockThreshold;

  const onAdd = () => {
    if (blocked) return;
    if (needsChoice) setModal(true);
    else add(dish);
  };

  return (
    <>
      {/* `h-full` : sur l'accueil la carte est enveloppée dans un `Reveal`, qui
          devient la cellule de grille étirée. Sans cela l'article gardait sa
          hauteur naturelle à l'intérieur et `mt-auto` n'avait rien à remplir. */}
      <article className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1.5 hover:border-primary/35 hover:shadow-[var(--shadow-lg)]">
        {/* visuel */}
        <div className="sheen relative aspect-[4/3] overflow-hidden">
          {dish.photo ? (
            <Image
              src={dish.photo}
              alt={dish.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={priority}
              className={`object-cover transition duration-700 ease-out group-hover:scale-[1.07] ${
                epuise ? "grayscale" : ""
              }`}
            />
          ) : (
            <DishPlaceholder cat={dish.cat} name={dish.name} />
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
              type="button"
              onClick={() => toggleFavorite(dish.id)}
              className={`absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-white/85 backdrop-blur transition hover:scale-105 ${
                isFav ? "text-brick" : "text-ink-2"
              }`}
              aria-pressed={isFav}
              aria-label={
                isFav ? `Retirer ${dish.name} des favoris` : `Ajouter ${dish.name} aux favoris`
              }
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

          {/* Allergènes — information obligatoire avant la conclusion de l'achat
              en vente à distance (règlement UE 1169/2011, art. 14). */}
          {dish.allergens.length > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-ink-2">
              <span className="font-bold">Allergènes :</span>{" "}
              {dish.allergens.map((a) => ALLERGEN_LABEL[a]).join(", ")}
            </p>
          )}

          {lowStock && (
            <p className="mt-2 text-xs font-bold text-brick">Plus que {dish.stock}</p>
          )}

          {/* Prix + ajout.
              `mt-auto` et non `mt-4` : la ligne suivait le bas du contenu, si
              bien qu'une description sur trois lignes ou un tag supplémentaire
              décalait le bouton vers le bas. Dans une même rangée les boutons
              se retrouvaient à trois hauteurs différentes. Poussée en fin de
              colonne, la ligne s'aligne sur toutes les cartes de la rangée. */}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/70 pt-3">
            <span className="font-display text-xl text-brick">
              {dish.priceCents !== null ? fmtPrice(dish.priceCents) : "Bientôt"}
            </span>
            <button
              type="button"
              onClick={onAdd}
              disabled={blocked}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition duration-200 ${
                blocked
                  ? "cursor-not-allowed bg-panel-2 text-ink-2"
                  : "bg-primary text-white shadow-sm hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_var(--color-primary)] hover:brightness-105 active:translate-y-0 active:scale-95"
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
