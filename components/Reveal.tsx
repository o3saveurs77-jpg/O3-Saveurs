"use client";

import { useEffect, useRef, useState } from "react";

/* Le site n'avait aucun mouvement : les sections apparaissaient d'un bloc au
 * chargement, ce qui donnait une page « plate ». `Reveal` fait entrer son
 * contenu quand il arrive dans le champ de vision.
 *
 * L'observateur est déconnecté dès la première apparition : sans cela l'élément
 * rejouerait son animation à chaque aller-retour de défilement, ce qui est
 * fatigant plutôt que vivant.
 *
 * Le mouvement est une préférence système, pas un goût : si l'utilisateur a
 * demandé moins d'animations, on affiche directement sans transition. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  /** Décalage en ms — sert à cascader une grille de cartes. */
  delay?: number;
  as?: "div" | "section" | "li" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      // Déclenche un peu avant que l'élément touche le bas de l'écran :
      // l'animation est ainsi terminée quand le regard arrive dessus.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`reveal ${shown ? "is-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
