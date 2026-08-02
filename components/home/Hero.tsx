import Link from "next/link";
import Image from "next/image";
import { info } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { ZoneCheck } from "@/components/ZoneCheck";

export function Hero() {
  const sp = info.heroSpreads;
  return (
    <section className="relative isolate flex min-h-[600px] items-end overflow-hidden bg-ink text-white sm:min-h-[86vh]">
      {/* Photo plein cadre — remplace l'ancien collage de trois vignettes :
          une seule image large (la table dressée) porte toute la scène, comme
          une vitrine plutôt qu'un montage. */}
      <Image
        src={sp[0]}
        alt="Table dressée Ô 3 Saveurs — assortiment de plats"
        fill
        priority
        sizes="100vw"
        className="object-cover"
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
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-black/15 to-transparent"
        aria-hidden="true"
      />

      <div className="wrap relative flex w-full flex-col gap-6 py-16 sm:py-20 lg:py-24">
        <div className="rise flex max-w-xl flex-col gap-5">
          {/* Amorce façon "eyebrow" : ligne fine + libellé en petites capitales,
              avant le grand titre — signale l'univers de marque avant le message. */}
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.28em] text-white/75">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            {info.tag} · {info.sub}
          </div>

          <h1 className="text-[clamp(38px,6.4vw,64px)] leading-[0.98]">
            Le voyage{" "}
            <span className="font-script text-[1.1em] font-normal text-gold">des saveurs</span>
            <br />
            livré chez vous.
          </h1>

          <p className="max-w-md text-[17px] leading-relaxed text-white/90">
            Tajines, tcheb, yassa, mafé, grillades & bowls frais — la cuisine du monde de Chez
            Laila, préparée maison à Lognes.
          </p>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm">
              <Icon name="truck" size={15} /> Livraison & à emporter
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm">
              {info.partner}
            </span>
          </div>

          <div className="max-w-md">
            <ZoneCheck />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/carte"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-bold text-white transition hover:brightness-110"
            >
              <Icon name="list" size={18} /> Voir la carte
            </Link>
            <Link
              href="#saveurs"
              className="inline-flex items-center gap-2 rounded-full border border-white/35 px-6 py-3.5 font-bold text-white transition hover:bg-white/10"
            >
              Découvrir nos univers
            </Link>
          </div>

          <div className="flex items-center gap-2 text-white/90">
            <span className="flex gap-0.5 text-gold">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon key={i} name="star" size={16} fill />
              ))}
            </span>
            <span className="text-sm">
              <strong>4,8</strong> · 320+ avis
            </span>
          </div>
        </div>
      </div>

      {/* Repère de défilement — discret, absent en cas de préférence pour la
          sobriété du mouvement (voir le bloc `prefers-reduced-motion` global). */}
      <Link
        href="#saveurs"
        aria-label="Défiler vers la suite de la page"
        className="group absolute bottom-12 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/70 transition hover:text-white sm:flex"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.28em]">Défiler</span>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/35 transition group-hover:border-white/70">
          <Icon name="chevron" size={16} className="rotate-90" />
        </span>
      </Link>

      <div className="ots-band absolute inset-x-0 bottom-0" />
    </section>
  );
}
