/* Habillage commun des sections éditoriales.
 *
 * Chaque bloc choisit un fond parmi quatre, jamais une couleur libre : c'est
 * ici qu'on garantit que le texte reste lisible sur le fond retenu, quel que
 * soit le contenu saisi dans le back-office. Les blocs n'écrivent donc aucune
 * couleur eux-mêmes, ils demandent leur palette à `tone()`.
 */

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import {
  accents,
  photoAlt,
  strongs,
  type SectionContent,
  type SectionTheme,
} from "@/lib/pageSections";

export interface Tone {
  /** Fond et couleur de texte de la section. */
  wrapper: string;
  /** Ligne d'accroche manuscrite. */
  eyebrow: string;
  /** Texte courant, moins appuyé que le titre. */
  body: string;
  /** Carte posée sur ce fond. */
  card: string;
  /** Halo décoratif, sur les fonds foncés uniquement. */
  halo: string | null;
  /** Liseré de motif maison, entre deux aplats. */
  band: boolean;
  /** Vrai sur fond foncé — les blocs y choisissent des variantes claires. */
  dark: boolean;
}

const TONES: Record<SectionTheme, Tone> = {
  clair: {
    wrapper: "",
    eyebrow: "text-teal",
    body: "text-ink-2",
    card: "border-line bg-panel",
    halo: null,
    band: false,
    dark: false,
  },
  gris: {
    wrapper: "bg-panel-2",
    eyebrow: "text-teal",
    body: "text-ink-2",
    card: "border-line bg-panel",
    halo: null,
    band: false,
    dark: false,
  },
  sombre: {
    wrapper: "bg-ink text-cream",
    eyebrow: "text-gold",
    body: "text-cream/80",
    card: "border-white/15 bg-white/5",
    halo: "bg-[radial-gradient(80%_100%_at_85%_20%,color-mix(in_oklab,var(--color-primary)_20%,transparent),transparent_62%)]",
    band: false,
    dark: true,
  },
  brique: {
    wrapper: "bg-brick text-white",
    eyebrow: "text-gold",
    body: "text-white/90",
    card: "border-white/20 bg-white/10",
    halo: "bg-[radial-gradient(70%_120%_at_15%_50%,color-mix(in_oklab,var(--color-gold)_26%,transparent),transparent_60%)]",
    band: true,
    dark: true,
  },
};

export const tone = (theme: SectionTheme): Tone => TONES[theme];

/** Grilles autorisées — écrites en toutes lettres, Tailwind ne lit pas les variables. */
export function gridCols(columns: number): string {
  if (columns === 2) return "sm:grid-cols-2";
  if (columns === 4) return "sm:grid-cols-2 lg:grid-cols-4";
  if (columns === 5) return "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
  return "sm:grid-cols-3";
}

/* Géométrie de la page, telle que `.wrap` la fixe dans `globals.css` : largeur
 * plafonnée à 1180 px (bordures comprises), gouttière intérieure de 16 px puis
 * de 22 px à partir de 640 px. C'est de là que se déduit la largeur réelle
 * d'une case de grille — voir `gridSizes`. */
const WRAP_MAX = 1180;
const PAD_BASE = 16;
const PAD_SM = 22;

/** Les paliers de `gridCols`, en données. Les deux doivent rester d'accord. */
function gridSteps(columns: number, base: number): { min: number; cols: number }[] {
  const first = { min: 0, cols: base };
  if (columns === 2) return [first, { min: 640, cols: 2 }];
  if (columns === 4) return [first, { min: 640, cols: 2 }, { min: 1024, cols: 4 }];
  if (columns === 5)
    return [first, { min: 640, cols: 2 }, { min: 1024, cols: 3 }, { min: 1280, cols: 5 }];
  return [first, { min: 640, cols: 3 }];
}

/**
 * Valeur de `sizes` pour une photo posée dans une grille de section.
 *
 * `sizes` n'est pas une indication : c'est **la** valeur sur laquelle le
 * navigateur choisit la variante à télécharger, avant même d'avoir calculé la
 * mise en page. Les grilles annonçaient toutes « (max-width: 768px) 100vw,
 * 33vw », quel que soit leur nombre de colonnes. Deux erreurs à la clé :
 *
 *  · le seuil. Tailwind passe en plusieurs colonnes dès 640 px, pas 768 : sur
 *    un écran de 700 px, chaque vignette de 180 px réclamait une image plein
 *    écran, soit trois fois trop large ;
 *  · le plafond. `.wrap` s'arrête à 1180 px, donc une case de grille à trois
 *    colonnes ne dépasse jamais 363 px. « 33vw » en demandait 634 sur un écran
 *    de 1920 px — une variante plus lourde, et souvent une **seconde**
 *    variante téléchargée pour une photo déjà chargée ailleurs dans la page.
 *
 * On décrit donc la grille telle qu'elle est : ses paliers, ses gouttières et
 * le plafond de la page. Une case vaut (largeur disponible − gouttières) /
 * colonnes, et la largeur disponible vaut `100vw` moins les marges — tout se
 * ramène à une seule soustraction et une seule division.
 */
export function gridSizes({
  columns,
  gap,
  base = 1,
  halfFrom = 0,
  halfGap = 0,
}: {
  columns: number;
  /** Gouttière de la grille, en pixels : `gap-4` vaut 16, `gap-6` vaut 24. */
  gap: number;
  /** Colonnes sous 640 px, pour les grilles qui en imposent déjà deux. */
  base?: number;
  /** Palier à partir duquel la grille ne tient plus qu'une demi-page. */
  halfFrom?: number;
  /** Gouttière de ce partage en deux : `gap-10` vaut 40. */
  halfGap?: number;
}): string {
  const steps = gridSteps(columns, base);

  /* Du plus large au plus étroit : `sizes` retient la première condition qui
     s'applique, l'ordre inverse ne décrirait que le plus petit écran. */
  const mins = [...new Set([...steps.map((s) => s.min), halfFrom, WRAP_MAX])].sort((a, b) => b - a);

  return mins
    .map((min) => {
      const cols = [...steps].reverse().find((s) => s.min <= min)!.cols;
      const half = halfFrom > 0 && min >= halfFrom;
      const pad = min >= 640 ? PAD_SM : PAD_BASE;

      const fixed = 2 * pad + (half ? halfGap : 0) + (half ? 2 : 1) * gap * (cols - 1);
      const div = cols * (half ? 2 : 1);

      const value =
        min >= WRAP_MAX
          ? // Au-delà, la page ne grandit plus : la case a une largeur arrêtée.
            `${Math.round((WRAP_MAX - fixed) / div)}px`
          : div === 1
            ? `calc(100vw - ${fixed}px)`
            : `calc((100vw - ${fixed}px) / ${div})`;

      return min > 0 ? `(min-width: ${min}px) ${value}` : value;
    })
    .join(", ");
}

/** Titre dont les passages entre astérisques passent en manuscrit doré. */
export function Accent({ text }: { text: string }) {
  return (
    <>
      {accents(text).map((part, i) =>
        part.accent ? (
          <span key={i} className="font-script text-[1.1em] font-normal text-gold">
            {part.text}
          </span>
        ) : (
          // Les retours à la ligne saisis sont conservés tels quels.
          <span key={i} className="whitespace-pre-line">
            {part.text}
          </span>
        ),
      )}
    </>
  );
}

/** Texte courant dont les passages entre doubles astérisques sont appuyés. */
export function Strong({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {strongs(text).map((part, i) =>
        part.strong ? (
          <strong key={i} className={className || "text-ink"}>
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Chapeau d'une section : accroche manuscrite, titre, sous-titre. */
export function SectionHeading({
  content,
  t,
  align = "center",
}: {
  content: SectionContent;
  t: Tone;
  align?: "center" | "left";
}) {
  if (!content.eyebrow && !content.title && !content.subtitle) return null;

  return (
    <Reveal className={align === "center" ? "text-center" : ""}>
      {content.eyebrow && (
        <p className={`font-script text-3xl ${t.eyebrow}`}>{content.eyebrow}</p>
      )}
      {content.title && (
        <h2 className="mt-1 text-3xl sm:text-4xl">
          <Accent text={content.title} />
        </h2>
      )}
      {content.subtitle && (
        <p
          className={`mt-3 max-w-2xl text-[15px] ${t.body} ${align === "center" ? "mx-auto" : ""}`}
        >
          {content.subtitle}
        </p>
      )}
    </Reveal>
  );
}

/**
 * Enveloppe d'une section : fond, halo, liseré et largeur de page.
 * `bare` sert aux blocs qui gèrent eux-mêmes leur mise en page interne.
 */
export function SectionWrap({
  theme,
  children,
  className = "",
  pad = "py-14 sm:py-16",
  id,
}: {
  theme: SectionTheme;
  children: React.ReactNode;
  className?: string;
  /** Respiration verticale — les bandeaux courts en demandent moins. */
  pad?: string;
  id?: string;
}) {
  const t = tone(theme);
  return (
    <section id={id} className={`relative overflow-hidden ${t.wrapper} ${className}`}>
      {t.band && <div className="ots-band flip" />}
      {t.halo && <div className={`pointer-events-none absolute inset-0 ${t.halo}`} aria-hidden="true" />}
      <div className={`wrap relative ${pad}`}>{children}</div>
    </section>
  );
}

/** Les deux boutons d'une section, quand ils sont renseignés. */
export function CtaRow({
  content,
  t,
  className = "",
}: {
  content: SectionContent;
  t: Tone;
  className?: string;
}) {
  const hasMain = content.ctaLabel && content.ctaHref;
  const hasAlt = content.altLabel && content.altHref;
  if (!hasMain && !hasAlt) return null;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {hasMain && (
        <Link
          href={content.ctaHref}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
        >
          {content.ctaLabel} <Icon name="arrow" size={16} />
        </Link>
      )}
      {hasAlt && (
        <Link
          href={content.altHref}
          className={`rounded-full border px-5 py-3 font-semibold transition ${
            t.dark ? "border-cream/30 hover:bg-white/10" : "border-line hover:bg-panel-2"
          }`}
        >
          {content.altLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Grille de photos décalées en quinconce, comme sur la page « À propos ».
 * `height` varie selon le contexte : plus haute quand la grille est seule.
 */
export function PhotoGrid({
  photos,
  alts,
  title,
  columns = 2,
  height = "h-40",
  lead = false,
}: {
  photos: string[];
  /** Descriptions saisies au back-office, rangées par chemin de photo. */
  alts: Record<string, string>;
  /** Titre de la section — sert de repli au texte alternatif. */
  title?: string;
  columns?: number;
  height?: string;
  /**
   * Cette grille porte-t-elle la première image de la page ? Si oui, sa
   * première photo est préchargée ; voir `SectionList`, qui en désigne une
   * seule pour toute la page.
   */
  lead?: boolean;
}) {
  if (!photos.length) return null;

  /* La grille vit dans la demi-colonne de « Texte & photos » (`md:grid-cols-2`,
     `gap-10`) à partir de 768 px : une case n'y vaut donc qu'un quart de page
     moins les gouttières, soit 266 px sur grand écran — et non les 25vw (480 px
     à 1920) annoncés jusqu'ici. */
  const sizes = gridSizes({ columns, gap: 16, base: 2, halfFrom: 768, halfGap: 40 });

  return (
    <div className={`grid gap-4 ${gridCols(columns)} grid-cols-2`}>
      {photos.map((src, i) => (
        <Reveal key={`${src}-${i}`} delay={i * 100}>
          <div
            className={`group relative w-full overflow-hidden rounded-2xl shadow-[var(--shadow-lg)] ${height} ${
              i % 2 ? "translate-y-4" : ""
            }`}
          >
            <Image
              src={src}
              alt={photoAlt(src, alts, { title, index: i, total: photos.length })}
              fill
              sizes={sizes}
              priority={lead && i === 0}
              className="object-cover transition duration-700 ease-out group-hover:scale-110"
            />
          </div>
        </Reveal>
      ))}
    </div>
  );
}
