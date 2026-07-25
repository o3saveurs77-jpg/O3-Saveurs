"use client";

import { useMemo, useState } from "react";
import { cats } from "@/lib/menu";
import { useDishes } from "@/components/providers/DishesContext";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";

type Filter = "all" | "popular" | "healthy";

export function MenuClient() {
  const { dishes } = useDishes();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCat, setActiveCat] = useState<string>(cats[0].id);

  const q = query.trim().toLowerCase();

  // items filtrés (recherche + filtre rapide)
  const filtered = useMemo(() => {
    return dishes.filter((it) => {
      if (filter === "popular" && !it.popular) return false;
      if (filter === "healthy" && it.badge !== "Healthy") return false;
      if (q && !(`${it.name} ${it.desc}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [q, filter, dishes]);

  // regroupe par catégorie en gardant l'ordre de `cats`
  const grouped = useMemo(
    () =>
      cats
        .map((c) => ({ cat: c, dishes: filtered.filter((it) => it.cat === c.id) }))
        .filter((g) => g.dishes.length > 0),
    [filtered]
  );

  const scrollToCat = (id: string) => {
    setActiveCat(id);
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* barre collante : recherche + filtres + catégories */}
      <div className="nav-blur sticky top-[68px] z-40 border-b border-line">
        <div className="wrap py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* recherche */}
            <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-panel px-4">
              <Icon name="search" size={18} className="text-ink-2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un plat…"
                className="w-full bg-transparent py-2.5 text-[15px] outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Effacer">
                  <Icon name="x" size={16} className="text-ink-2" />
                </button>
              )}
            </div>

            {/* filtres rapides */}
            <div className="flex gap-2">
              {(
                [
                  { k: "all", label: "Tout" },
                  { k: "popular", label: "Populaires" },
                  { k: "healthy", label: "Healthy" },
                ] as { k: Filter; label: string }[]
              ).map((f) => (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filter === f.k
                      ? "bg-primary text-white"
                      : "border border-line bg-panel text-ink hover:bg-panel-2"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* rail de catégories */}
          <div className="no-scrollbar -mb-1 mt-3 flex gap-2 overflow-x-auto pb-1">
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => scrollToCat(c.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  activeCat === c.id
                    ? "bg-brick text-white"
                    : "bg-panel-2 text-ink-2 hover:text-ink"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* sections */}
      <div className="wrap py-10">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center text-ink-2">
            <Icon name="search" size={48} className="opacity-30" />
            <p className="text-lg font-bold">Aucun plat trouvé</p>
            <p>Essayez un autre mot-clé ou réinitialisez les filtres.</p>
          </div>
        ) : (
          grouped.map(({ cat, dishes }) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-[180px] pb-12">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="font-script text-4xl text-brick">{cat.script}</h2>
                <span className="h-px flex-1 bg-line" />
                <span className="text-sm font-semibold text-ink-2">{dishes.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {dishes.map((d) => (
                  <DishCard key={d.id} dish={d} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
