"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cats } from "@/lib/menu";
import { useDishes } from "@/components/providers/DishesContext";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";

type Filter = "all" | "popular" | "healthy";

export function MenuClient() {
  const { dishes, ready, error } = useDishes();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCat, setActiveCat] = useState<string>(cats[0].id);

  // Un clic sur le rail impose la catégorie active le temps du défilement
  // fluide : sans cela l'observateur la ferait osciller pendant l'animation.
  const lockedUntil = useRef(0);

  const q = query.trim().toLowerCase();

  // items filtrés (recherche + filtre rapide)
  const filtered = useMemo(() => {
    return dishes.filter((it) => {
      if (filter === "popular" && !it.popular) return false;
      if (filter === "healthy" && it.badge !== "Healthy") return false;
      if (q && !`${it.name} ${it.desc}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [q, filter, dishes]);

  // regroupe par catégorie en gardant l'ordre de `cats`
  const grouped = useMemo(
    () =>
      cats
        .map((c) => ({ cat: c, dishes: filtered.filter((it) => it.cat === c.id) }))
        .filter((g) => g.dishes.length > 0),
    [filtered],
  );

  /* Le rail de catégories mentait dès qu'on faisait défiler la page : `activeCat`
   * n'était mis à jour que par un clic, si bien que la pastille restait sur
   * « Entrées » pendant la lecture des desserts. */
  useEffect(() => {
    const ids = grouped.map((g) => g.cat.id);
    if (ids.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < lockedUntil.current) return;
        // section la plus haute parmi celles qui sont visibles
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveCat(visible.target.id.replace(/^cat-/, ""));
      },
      // la barre collante occupe ~180 px : on observe la bande sous elle
      { rootMargin: "-190px 0px -60% 0px", threshold: 0 },
    );

    for (const id of ids) {
      const el = document.getElementById(`cat-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [grouped]);

  const scrollToCat = (id: string) => {
    setActiveCat(id);
    lockedUntil.current = Date.now() + 900;
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
              <label htmlFor="menu-search" className="sr-only">
                Rechercher un plat
              </label>
              <Icon name="search" size={18} className="text-ink-2" />
              <input
                id="menu-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un plat…"
                className="w-full bg-transparent py-2.5 text-[15px] outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">
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
                  type="button"
                  onClick={() => setFilter(f.k)}
                  aria-pressed={filter === f.k}
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
          <nav aria-label="Catégories de la carte">
            <ul className="no-scrollbar -mb-1 mt-3 flex gap-2 overflow-x-auto pb-1">
              {cats.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => scrollToCat(c.id)}
                    aria-current={activeCat === c.id ? "true" : undefined}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      activeCat === c.id
                        ? "bg-brick text-white"
                        : "bg-panel-2 text-ink-2 hover:text-ink"
                    }`}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* mention allergènes — obligation d'information (règlement UE 1169/2011) */}
      <div className="wrap pt-6">
        <p className="flex items-start gap-2 rounded-xl border border-line bg-panel-2 p-3 text-sm text-ink-2">
          <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Les allergènes majeurs sont indiqués sous chaque plat. Une question, une intolérance ou
            une allergie ? Appelez-nous avant de commander.
          </span>
        </p>
      </div>

      {/* sections */}
      <div className="wrap py-10">
        {error && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-line bg-primary-soft p-4 text-sm text-brick"
          >
            La carte n'a pas pu être chargée. Rechargez la page ou appelez-nous pour commander.
          </p>
        )}

        {!ready && dishes.length === 0 ? (
          <p className="py-24 text-center text-ink-2">Chargement de la carte…</p>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center text-ink-2">
            <Icon name="search" size={48} className="opacity-30" />
            <p className="text-lg font-bold">Aucun plat trouvé</p>
            <p>Essayez un autre mot-clé ou réinitialisez les filtres.</p>
          </div>
        ) : (
          grouped.map(({ cat, dishes: catDishes }) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-[180px] pb-12">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="font-script text-4xl text-brick">{cat.script}</h2>
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
                <span className="text-sm font-semibold text-ink-2">{catDishes.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {catDishes.map((d) => (
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
