"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cats, isOrderable } from "@/lib/menu";
import type { Dish } from "@/lib/menu";
import type { Allergen } from "@/lib/types";
import { useDishes } from "@/components/providers/DishesContext";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";
import { MenuFilters, EMPTY_FILTERS, countActive } from "./MenuFilters";
import type { FiltersState } from "./MenuFilters";

/* La carte n'existait que côté navigateur : `useDishes()` part d'une liste vide
 * et appelle `/api/dishes` au montage. Le HTML servi pour `/carte` ne contenait
 * donc aucun plat — ni nom, ni prix — sur la page la plus commerciale du site.
 *
 * `initial` porte les plats lus en base par le composant serveur. Le contexte
 * prend le relais dès qu'il a répondu : le back-office garde ses mises à jour
 * en direct, sans que la première peinture soit vide. */
export function MenuClient({ initial = [] }: { initial?: Dish[] }) {
  const ctx = useDishes();
  const { ready, error } = ctx;
  const dishes = ready && ctx.dishes.length > 0 ? ctx.dishes : initial;

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [activeCat, setActiveCat] = useState<string>(cats[0].id);
  const [drawer, setDrawer] = useState(false);

  // Un clic sur une catégorie impose la catégorie active le temps du défilement
  // fluide : sans cela l'observateur la ferait osciller pendant l'animation.
  const lockedUntil = useRef(0);

  const q = query.trim().toLowerCase();

  /* Bornes du curseur de prix, calculées sur le catalogue réel plutôt que
   * codées en dur : un plat à 25 € ajouté au back-office reste atteignable. */
  const priceBounds = useMemo(() => {
    const prix = dishes.map((d) => d.priceCents).filter((p): p is number => p !== null);
    if (prix.length === 0) return { min: 0, max: 2000 };
    return { min: Math.floor(Math.min(...prix) / 50) * 50, max: Math.ceil(Math.max(...prix) / 50) * 50 };
  }, [dishes]);

  /* Seuls les allergènes réellement présents à la carte sont proposés : offrir
   * « Lupin » alors qu'aucun plat n'en contient donne un filtre qui ne change
   * jamais rien. */
  const allergens = useMemo(() => {
    const s = new Set<Allergen>();
    for (const d of dishes) for (const a of d.allergens) s.add(a);
    return [...s].sort();
  }, [dishes]);

  const filtered = useMemo(() => {
    const out = dishes.filter((it) => {
      if (filters.badges.size > 0) {
        const match =
          (filters.badges.has("popular") && it.popular) ||
          (filters.badges.has("Healthy") && it.badge === "Healthy") ||
          (filters.badges.has("Nouveau") && it.badge === "Nouveau");
        if (!match) return false;
      }
      if (filters.hideUnavailable && !isOrderable(it)) return false;
      if (filters.maxPriceCents !== null) {
        // Un plat sans prix (« Bientôt ») n'a rien à faire sous un plafond.
        if (it.priceCents === null || it.priceCents > filters.maxPriceCents) return false;
      }
      if (filters.excluded.size > 0 && it.allergens.some((a) => filters.excluded.has(a))) {
        return false;
      }
      if (q && !`${it.name} ${it.desc}`.toLowerCase().includes(q)) return false;
      return true;
    });

    if (filters.sort !== "menu") {
      const dir = filters.sort === "price-asc" ? 1 : -1;
      // Les plats sans prix restent en fin de liste dans les deux sens.
      out.sort((a, b) => {
        if (a.priceCents === null) return 1;
        if (b.priceCents === null) return -1;
        return (a.priceCents - b.priceCents) * dir;
      });
    }
    return out;
  }, [dishes, q, filters]);

  // regroupe par catégorie en gardant l'ordre de `cats`
  const grouped = useMemo(
    () =>
      cats
        .map((c) => ({ cat: c, dishes: filtered.filter((it) => it.cat === c.id) }))
        .filter((g) => g.dishes.length > 0),
    [filtered],
  );

  /** Compte par catégorie après filtrage — alimente les pastilles de la colonne. */
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cats) m[c.id] = 0;
    for (const d of filtered) m[d.cat] = (m[d.cat] ?? 0) + 1;
    return m;
  }, [filtered]);

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
      // la barre collante occupe ~140 px : on observe la bande sous elle
      { rootMargin: "-150px 0px -60% 0px", threshold: 0 },
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
    setDrawer(false);
  };

  const nbActifs = countActive(filters);
  const total = filtered.length;

  // `min-w-0` sur le conteneur ci-dessous : un input flex sans ça garde sa
  // largeur minimale de contenu (~180 px) au lieu de suivre `w-full`, et
  // pousse le bouton Filtres hors champ sous ~375 px.
  const champRecherche = (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-panel px-4">
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
  );

  const panneau = (
    <MenuFilters
      state={filters}
      onChange={setFilters}
      counts={counts}
      activeCat={activeCat}
      onPickCat={scrollToCat}
      priceBounds={priceBounds}
      allergens={allergens}
    />
  );

  return (
    <>
      {/* ── Barre collante : recherche + accès aux filtres ── */}
      <div className="nav-blur sticky top-[68px] z-40 border-b border-line">
        <div className="wrap flex items-center gap-3 py-3">
          {champRecherche}
          <span className="hidden shrink-0 text-sm font-semibold text-ink-2 sm:block">
            {total} plat{total > 1 ? "s" : ""}
          </span>
          {/* Le panneau vit dans la colonne latérale au-delà de `lg` ; en deçà,
              ce bouton ouvre le même contenu en tiroir. */}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 lg:hidden"
            aria-expanded={drawer}
          >
            <Icon name="list" size={16} /> Filtres
            {nbActifs > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs text-primary">
                {nbActifs}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mention allergènes — obligation d'information (règlement UE 1169/2011).
          Le texte annonçait « les allergènes majeurs sont indiqués sous chaque
          plat » quel que soit l'état réel du catalogue. Tant qu'aucune fiche
          n'est renseignée, c'était une affirmation fausse sur un sujet où se
          tromper envoie quelqu'un à l'hôpital. Le message suit désormais les
          données : il n'annonce l'étiquetage que là où il existe, et renvoie au
          téléphone dans le cas contraire. */}
      <div className="wrap pt-6">
        <p className="flex items-start gap-2 rounded-xl border border-line bg-panel-2 p-3 text-sm text-ink-2">
          <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-primary" />
          <span>
            {allergens.length > 0 ? (
              <>
                Les allergènes connus sont indiqués sous les plats concernés. Cette liste peut être
                incomplète : en cas d'intolérance ou d'allergie, appelez-nous avant de commander.
              </>
            ) : (
              <>
                <strong className="text-brick">
                  Les allergènes ne sont pas encore renseignés sur cette carte.
                </strong>{" "}
                En cas d'intolérance ou d'allergie, appelez-nous impérativement avant de commander —
                nous vous indiquerons la composition exacte de chaque plat.
              </>
            )}
          </span>
        </p>
      </div>

      <div className="wrap grid gap-8 py-10 lg:grid-cols-[248px_1fr]">
        {/* ── Colonne latérale (bureau) ─────────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-[150px] max-h-[calc(100vh-170px)] overflow-y-auto pr-1">
            {panneau}
          </div>
        </aside>

        {/* ── Sections ──────────────────────────────────── */}
        <div>
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
              {(nbActifs > 0 || q) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    setQuery("");
                  }}
                  className="mt-1 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-105"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          ) : (
            grouped.map(({ cat, dishes: catDishes }) => (
              <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-[150px] pb-12">
                <div className="mb-5 flex items-center gap-3">
                  <h2 className="font-script text-4xl text-brick">{cat.script}</h2>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  <span className="text-sm font-semibold text-ink-2">{catDishes.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {catDishes.map((d) => (
                    <DishCard key={d.id} dish={d} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {/* ── Tiroir de filtres (mobile & tablette) ───────── */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtres">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawer(false)}
            aria-label="Fermer les filtres"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(360px,88vw)] flex-col bg-page shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-display text-lg">Filtres</p>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Fermer"
                className="grid h-9 w-9 place-items-center rounded-full bg-panel-2 transition hover:bg-line"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{panneau}</div>
            <div className="border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="w-full rounded-full bg-primary py-3 font-bold text-white transition hover:brightness-105"
              >
                Voir {total} plat{total > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
