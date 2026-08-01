import Link from "next/link";
import Image from "next/image";
import { info } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { ZoneCheck } from "@/components/ZoneCheck";

export function Hero() {
  const sp = info.heroSpreads;
  return (
    <section className="relative overflow-hidden bg-primary text-white">
      {/* Aplat orange uni auparavant : le dégradé creuse la profondeur derrière
          le collage et évite l'effet « bloc de couleur ». */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_18%,color-mix(in_oklab,var(--color-gold)_38%,transparent),transparent_62%),radial-gradient(90%_70%_at_8%_92%,color-mix(in_oklab,var(--color-brick)_42%,transparent),transparent_58%)]"
        aria-hidden="true"
      />
      {/* décor soleil */}
      <div
        className="ots-sun pointer-events-none absolute -right-16 -top-20 h-[280px] w-[280px] opacity-20"
        aria-hidden="true"
      />
      {/* `relative` obligatoire : les décors ci-dessus sont positionnés et
          peindraient par-dessus le contenu statique sans contexte d'empilement. */}
      <div className="wrap relative grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        {/* texte */}
        <div className="rise flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold">
              <Icon name="truck" size={15} /> Livraison & à emporter
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold">
              {info.partner}
            </span>
          </div>

          <h1 className="text-[clamp(38px,6vw,62px)] leading-[0.98]">
            Le voyage{" "}
            <span className="font-script text-[1.1em] font-normal text-gold">des saveurs</span>
            <br />
            livré chez vous.
          </h1>

          <p className="max-w-md text-[17px] leading-relaxed text-white/90">
            Tajines, tcheb, yassa, mafé, grillades & bowls frais — la cuisine du monde de Chez
            Laila, préparée maison à Lognes.
          </p>

          <div className="max-w-md">
            <ZoneCheck />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/carte"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-bold text-page transition hover:brightness-110"
            >
              <Icon name="list" size={18} /> Voir la carte
            </Link>
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

        {/* Collage photos.
            Ces trois visuels étaient des `<img>` bruts : servis en pleine
            résolution quelle que soit la taille d'écran, sans conversion de
            format ni dimensions réservées. Comme le plus grand porte le LCP de
            l'accueil, c'était la pire image du site à laisser non optimisée.
            `next/image` s'en charge ; `priority` sur le grand, les deux petits
            restent en chargement différé. */}
        <div className="rise group relative hidden h-[440px] lg:block">
          <div className="absolute inset-[0_0_64px_56px] rotate-2 overflow-hidden rounded-3xl shadow-[var(--shadow-lg)] transition-transform duration-500 hover:rotate-0">
            <Image
              src={sp[0]}
              alt="Assortiment de plats Ô 3 Saveurs"
              fill
              priority
              sizes="(max-width: 1024px) 0px, 40vw"
              className="object-cover"
            />
          </div>
          <div className="absolute bottom-0 left-0 h-44 w-44 -rotate-4 overflow-hidden rounded-2xl border-[5px] border-primary shadow-[var(--shadow-lg)] transition-transform duration-500 hover:-rotate-1">
            <Image
              src={sp[1]}
              alt="Tajine du Maghreb"
              fill
              sizes="(max-width: 1024px) 0px, 176px"
              className="object-cover"
            />
          </div>
          <div className="absolute right-0 top-4 h-36 w-36 rotate-3 overflow-hidden rounded-2xl border-[5px] border-primary shadow-[var(--shadow-lg)] transition-transform duration-500 hover:rotate-0">
            <Image
              src={sp[2]}
              alt="Plat africain"
              fill
              sizes="(max-width: 1024px) 0px, 144px"
              className="object-cover"
            />
          </div>
        </div>
      </div>
      <div className="ots-band" />
    </section>
  );
}
