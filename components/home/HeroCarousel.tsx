"use client";

/* Vitrine défilante du bandeau d'accueil.
 *
 * L'encadré de droite ne montrait qu'une photo, choisie une fois pour toutes
 * dans le back-office : le visiteur repartait avec l'idée d'un plat, quand la
 * maison en cuisine une trentaine. Les photos défilent désormais, légendées du
 * nom exact du plat — la vitrine devient un extrait de la carte plutôt qu'une
 * illustration.
 *
 * Le composant ne connaît que le mouvement : la plaque de marque du bas lui est
 * passée en `children` et reste rendue côté serveur.
 */

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export interface HeroSlide {
  src: string;
  /** Nom du plat, ou chaîne vide pour une photo d'ambiance sans légende. */
  label: string;
}

/** Durée d'affichage d'une photo. */
const DELAY_MS = 4500;

export function HeroCarousel({
  slides,
  children,
}: {
  slides: HeroSlide[];
  children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  /* Une photo seule n'est pas un carrousel : ni minuterie, ni pastilles, ni
   * annonce aux lecteurs d'écran. */
  const animated = slides.length > 1;
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (!animated || paused) return;

    /* Le défilement automatique est du mouvement non sollicité : sous
     * `prefers-reduced-motion`, il s'arrête net et les pastilles suffisent à
     * parcourir les photos. La règle globale de `globals.css` neutralise les
     * transitions, elle ne peut rien contre une minuterie. */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (still.matches) return;

    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), DELAY_MS);
    return () => window.clearInterval(timer);
  }, [animated, paused, slides.length]);

  /* Survol, doigt posé ou focus clavier : on suspend. Regarder une photo ne
   * doit pas être une course contre la minuterie, et une pastille qui se
   * dérobe sous le curseur est intenable à viser. */
  const hold = () => setPaused(true);
  const release = () => setPaused(false);

  /* Chargement des photos suivantes : différé, pas annulé.
   *
   * Translatées hors d'un conteneur `overflow-hidden`, elles ne deviennent
   * jamais « visibles » au sens du chargement différé — en `lazy` pur, le
   * visiteur qui glisse tomberait sur un cadre vide. D'où le `eager` posé
   * ici à l'origine. Sauf que Next 15 émet un `<link rel="preload">` pour
   * chaque image `eager` : les six photos de la vitrine partaient en tête du
   * `<head>`, au même rang de priorité que la photo du bandeau — celle qui
   * décide du LCP, donc de la note de performance que Google prend en compte.
   * Six téléchargements lourds passaient devant elle.
   *
   * On garde les deux propriétés : `lazy` au premier rendu, le temps que le
   * bandeau s'affiche, puis bascule en `eager` dès que le navigateur souffle.
   * Changer l'attribut d'une image déjà montée déclenche bien son chargement,
   * et à cet instant le `<head>` est joué depuis longtemps. */
  const [preloadRest, setPreloadRest] = useState(false);

  useEffect(() => {
    if (!animated) return;
    const canIdle = typeof window.requestIdleCallback === "function";
    // Le `timeout` est un garde-fou : sur un onglet chargé, l'inactivité peut
    // ne jamais venir, et les photos doivent finir par se charger quand même.
    const id = canIdle
      ? window.requestIdleCallback(() => setPreloadRest(true), { timeout: 3000 })
      : window.setTimeout(() => setPreloadRest(true), 1200);
    return () => {
      if (canIdle) window.cancelIdleCallback(id as number);
      else window.clearTimeout(id as number);
    };
  }, [animated]);

  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-[28px] border-4 border-white/20 shadow-[var(--shadow-lg)]"
      role="group"
      aria-roledescription={animated ? "carrousel" : undefined}
      aria-label={animated ? "Photos de nos plats" : undefined}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      onTouchStart={hold}
      onTouchEnd={release}
    >
      {/* Rail translaté plutôt que fondu enchaîné : le glissement dit qu'il y a
          une suite, là où un fondu peut passer pour un simple changement. */}
      <div
        className="flex h-full w-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div key={`${slide.src}-${i}`} className="relative h-full w-full shrink-0">
            <Image
              src={slide.src}
              alt={slide.label || "Spécialité de la maison"}
              fill
              /* La première porte le `priority` — c'est la seule que le
                 `<head>` a le droit de précharger. Les autres attendent
                 `preloadRest` (voir plus haut) : différées, jamais oubliées. */
              priority={i === 0}
              loading={i === 0 ? undefined : preloadRest ? "eager" : "lazy"}
              sizes="(min-width: 1024px) 38vw, 90vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
        aria-hidden="true"
      />

      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3">
        {/* Légende + pastilles, au-dessus de la plaque de marque. */}
        {animated && (
          <div className="flex items-end justify-between gap-3 px-1">
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              {slides[index].label}
            </p>

            <div className="flex shrink-0 items-center gap-1.5">
              {slides.map((slide, i) => (
                <button
                  key={`${slide.src}-${i}`}
                  type="button"
                  aria-current={i === index ? "true" : undefined}
                  aria-label={slide.label ? `Voir ${slide.label}` : `Photo ${i + 1}`}
                  onClick={() => go(i)}
                  /* Cible tactile de 24 px autour d'un point de 6 px : viser un
                     point de six pixels au doigt relève de la loterie. */
                  className="grid h-6 w-4 place-items-center"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all ${
                      i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
