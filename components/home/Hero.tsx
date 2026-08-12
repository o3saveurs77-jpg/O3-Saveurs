import Link from "next/link";
import Image from "next/image";
import { info, cats, photo, type Dish } from "@/lib/menu";
import { Icon, type IconName } from "@/components/Icon";
import { ZoneCheck } from "@/components/ZoneCheck";
import { Emblem } from "@/components/Brand";
import { Accent } from "@/components/sections/Shell";
import { HeroCarousel, type HeroSlide } from "@/components/home/HeroCarousel";
import type { SectionContent } from "@/lib/pageSections";

// Les trois univers culinaires du restaurant, tels que déclarés dans le
// catalogue (`cats`).
const SAVEUR_IDS: { id: string; icon: IconName }[] = [
  { id: "africaine", icon: "flame" },
  { id: "maghreb", icon: "leaf" },
  { id: "medit", icon: "sparkle" },
];

/**
 * Ce que fait défiler la vitrine, par ordre de préférence.
 *
 * Les plats de la carte d'abord : ils sont photographiés, ils portent un nom, et
 * ils disparaissent d'eux-mêmes du bandeau quand la cuisine les retire. À
 * défaut — base injoignable, aucune photo de plat renseignée — les photos de la
 * section prennent le relais, puis les visuels du catalogue : le bandeau ne doit
 * jamais se retrouver avec un cadre vide.
 */
function buildSlides(content: SectionContent, dishes: Dish[]): HeroSlide[] {
  const fromDishes = dishes
    .filter((d) => d.photo)
    .map((d) => ({ src: d.photo as string, label: d.name }));
  if (fromDishes.length > 1) return fromDishes;

  const fromContent = content.photos.slice(1);
  const fallback = fromContent.length ? fromContent : info.heroSpreads.slice(1);
  return fallback.map((src) => ({ src, label: "" }));
}

/**
 * Bandeau d'ouverture de l'accueil.
 *
 * Son accroche, son titre, sa photo de fond, ses pastilles et ses boutons
 * viennent du back-office (`PageSection` de type `hero`) : la cliente change
 * son message d'accueil sans déploiement. La mise en page, elle, reste ici.
 */
export function Hero({ content, dishes = [] }: { content: SectionContent; dishes?: Dish[] }) {
  // Repli sur les visuels du catalogue si aucune photo n'a été choisie : un
  // hero sans image serait un aplat noir en haut de l'accueil.
  const background = content.photos[0] ?? photo(3);
  const slides = buildSlides(content, dishes);
  const saveurs = SAVEUR_IDS.map(({ id, icon }) => ({
    icon,
    label: cats.find((c) => c.id === id)?.label ?? id,
  }));
  // Le repère de défilement ne vaut que pour une ancre de la même page.
  const scrollTarget = content.altHref.startsWith("#") ? content.altHref : null;

  return (
    <section className="relative isolate min-h-[560px] overflow-hidden bg-ink text-white sm:min-h-[620px] lg:min-h-[680px]">
      {/* Photo plein cadre en arrière-plan — la vitrine visuelle de la
          colonne de droite ajoute un second visuel par-dessus, mais on garde
          cette photo de fond pour que le hero ne devienne pas une simple
          illustration plate.
          `min-h-*` : sans plancher, la hauteur ne dépendait que du contenu de
          la grille ; sur un écran très large, le texte tient sur moins de
          hauteur et la section se retrouve basse et large. La photo source
          (1600×1066, ratio ~3:2) subissait alors un `object-cover` sur un
          cadre bien plus large que haut : elle était rognée à une mince bande
          horizontale, ne montrant plus qu'un fragment de l'assiette. */}
      <Image
        src={background}
        alt="Table dressée Ô 3 Saveurs — assortiment de plats"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_30%]"
      />
      {/* Double voile : un dégradé bas → haut pour que le texte reste lisible
          quelle que soit la hauteur de l'écran, un dégradé gauche → droite
          pour assombrir spécifiquement la colonne de texte sans éteindre
          toute la photo (la partie droite reste lisible en large écran). */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent"
        aria-hidden="true"
      />

      <div className="wrap relative grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-24">
        <div className="rise flex max-w-xl flex-col gap-5">
          {/* Amorce façon "eyebrow" : ligne fine + libellé en petites capitales,
              avant le grand titre — signale l'univers de marque avant le message. */}
          {content.eyebrow && (
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.28em] text-white/75">
              <span className="h-px w-8 bg-gold" aria-hidden="true" />
              {content.eyebrow}
            </div>
          )}

          {content.title && (
            <h1 className="text-[clamp(38px,6.4vw,64px)] leading-[0.98]">
              <Accent text={content.title} />
            </h1>
          )}

          {content.body && (
            <p className="max-w-md text-[17px] leading-relaxed text-white/90">{content.body}</p>
          )}

          {content.items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {content.items.map((badge) => (
                <span
                  key={badge.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm"
                >
                  {badge.icon && <Icon name={badge.icon as IconName} size={15} />}
                  {badge.title}
                </span>
              ))}
            </div>
          )}

          <div className="max-w-md">
            <ZoneCheck />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {content.ctaLabel && content.ctaHref && (
              <Link
                href={content.ctaHref}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-bold text-white transition hover:brightness-110"
              >
                <Icon name="list" size={18} /> {content.ctaLabel}
              </Link>
            )}
            {content.altLabel && content.altHref && (
              <Link
                href={content.altHref}
                className="inline-flex items-center gap-2 rounded-full border border-white/35 px-6 py-3.5 font-bold text-white transition hover:bg-white/10"
              >
                {content.altLabel}
              </Link>
            )}
          </div>
        </div>

        {/* Vitrine « carte » — visuel de deuxième plan sur desktop, masqué en
            mobile pour ne pas alourdir l'écran où le bloc recherche prime. */}
        {slides.length > 0 && (
          <div className="hidden w-full max-w-md justify-self-center lg:block lg:justify-self-end">
            <HeroCarousel slides={slides}>
              <div className="rounded-2xl bg-panel/95 p-4 text-ink shadow-[var(--shadow-soft)] backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <Emblem size={38} />
                  <div className="leading-tight">
                    <p className="font-display text-sm text-ink">{info.name}</p>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                      La carte
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {saveurs.map((s) => (
                    <span
                      key={s.label}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs font-semibold text-ink-2"
                    >
                      <Icon name={s.icon} size={13} className="text-primary" />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </HeroCarousel>
          </div>
        )}
      </div>

      {/* Repère de défilement — discret, absent en cas de préférence pour la
          sobriété du mouvement (voir le bloc `prefers-reduced-motion` global). */}
      {scrollTarget && (
        <Link
          href={scrollTarget}
          aria-label="Défiler vers la suite de la page"
          className="group absolute bottom-12 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/70 transition hover:text-white sm:flex"
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.28em]">Défiler</span>
          <span className="grid h-9 w-9 place-items-center rounded-full border border-white/35 transition group-hover:border-white/70">
            <Icon name="chevron" size={16} className="rotate-90" />
          </span>
        </Link>
      )}

      <div className="ots-band absolute inset-x-0 bottom-0" />
    </section>
  );
}
