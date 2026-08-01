import Link from "next/link";
import Image from "next/image";
import { Hero } from "@/components/home/Hero";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { prisma } from "@/lib/prisma";
import { rowToDish, rowToZone } from "@/lib/serialize";
import { formules, info, fmtPrice } from "@/lib/menu";
import type { Dish, Zone } from "@/lib/menu";
import { loadDailySpecial } from "@/lib/dailySpecial";
import type { PlatDuJourView } from "@/lib/dailySpecial";

/* La page lisait `items` et `zones` de `lib/menu.ts`, c'est-à-dire les données
 * de seed : un prix ou un « populaire » modifié dans l'administration
 * n'apparaissait jamais ici, et « Nos incontournables » restait faux pour
 * toujours. Elle était de plus prérendue une fois pour toutes, si bien que le
 * `new Date()` du plat du jour était figé au build — l'encart ne s'affichait
 * jamais. Lecture en base + revalidation toutes les 5 minutes. */
export const revalidate = 300;

// Trio des grandes familles de saveurs
const SAVEURS = [
  {
    cat: "africaine",
    titre: "Afrique de l'Ouest",
    desc: "Tcheb, yassa, mafé, athiéké — riz au gras et sauces mijotées.",
    photo: "/photos/p04.jpg",
  },
  {
    cat: "maghreb",
    titre: "Maghreb",
    desc: "Tajines fondants : veau-pruneaux, poulet aux légumes, boulettes.",
    photo: "/photos/p11.jpg",
  },
  {
    cat: "asiatique",
    titre: "Asie",
    desc: "Loc lac, bo bun, nouilles sautées & sandwichs Banh Mì.",
    photo: "/photos/p25.jpg",
  },
];

/** Plats populaires, plat du jour, zones et seuil de livraison offerte — tout depuis la base. */
async function loadHome(): Promise<{
  populaires: Dish[];
  platToday: PlatDuJourView | null;
  zones: Zone[];
  freeDeliveryThresholdCents: number | null;
}> {
  /* La sélection du plat du jour vit dans `lib/dailySpecial.ts` depuis que la
   * Carte l'affiche elle aussi. Elle reste dans ce `Promise.all` : c'est une
   * promesse comme une autre, les trois lectures partent toujours ensemble. */
  const [dishRows, platToday, zoneRows, freeDeliveryPromo] = await Promise.all([
    prisma.dish.findMany({
      where: { popular: true, available: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      take: 6,
    }),
    loadDailySpecial(),
    prisma.zone.findMany({ where: { active: true }, orderBy: { idx: "asc" } }),
    prisma.promotion.findFirst({
      where: { kind: "free_delivery", active: true, auto: true },
      orderBy: { minSubtotalCents: "asc" },
      select: { minSubtotalCents: true },
    }),
  ]);

  return {
    populaires: dishRows.map(rowToDish),
    platToday,
    zones: zoneRows.map(rowToZone),
    freeDeliveryThresholdCents: freeDeliveryPromo?.minSubtotalCents ?? null,
  };
}

export default async function HomePage() {
  let populaires: Dish[] = [];
  let platToday: PlatDuJourView | null = null;
  let zones: Zone[] = [];
  let freeDeliveryThresholdCents: number | null = null;

  try {
    ({ populaires, platToday, zones, freeDeliveryThresholdCents } = await loadHome());
  } catch (error) {
    // Base indisponible : la vitrine reste lisible, sans afficher de faux prix.
    console.error("[accueil] lecture de la base échouée:", error);
  }

  return (
    <>
      <Hero />

      {/* ── Trio des saveurs ─────────────────────────────── */}
      <section className="wrap py-16">
        <Reveal className="text-center">
          <p className="font-script text-3xl text-teal">Trois continents</p>
          <h2 className="mt-1 text-3xl sm:text-4xl">Une assiette, le monde entier</h2>
        </Reveal>
        <div className="mt-9 grid gap-6 md:grid-cols-3">
          {SAVEURS.map((s, i) => (
            /* Cascade de 110 ms : les trois vignettes se posent l'une après
               l'autre plutôt qu'en bloc. */
            <Reveal key={s.cat} delay={i * 110}>
              <Link
                href="/carte"
                className="group relative block h-64 overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
              >
                <Image
                  src={s.photo}
                  alt={s.titre}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition duration-700 ease-out group-hover:scale-110"
                />
                {/* Le dégradé s'opacifie au survol pour garder le texte lisible
                    pendant que la photo s'agrandit dessous. */}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent transition-opacity duration-300 group-hover:from-black/90"
                  aria-hidden="true"
                />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <h3 className="font-script text-3xl text-gold drop-shadow-sm">{s.titre}</h3>
                  <p className="mt-1 text-sm text-white/90">{s.desc}</p>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-bold text-gold opacity-0 transition duration-300 group-hover:opacity-100">
                    Découvrir <Icon name="arrow" size={15} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Plat du jour ─────────────────────────────────── */}
      {platToday && (
        <section className="relative overflow-hidden bg-brick text-white">
          <div className="ots-band flip" />
          {/* Halo doré : le bandeau était un aplat rouge plein, très plat à
              côté du reste de la page. */}
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_15%_50%,color-mix(in_oklab,var(--color-gold)_26%,transparent),transparent_60%)]"
            aria-hidden="true"
          />
          <div className="wrap relative flex flex-col items-center gap-4 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-bold uppercase tracking-wide backdrop-blur">
                <Icon name="sparkle" size={15} /> Plat du jour · {platToday.jour}
              </p>
              <h2 className="mt-3 font-script text-4xl text-gold sm:text-5xl">{platToday.name}</h2>
              <p className="mt-2 text-white/90">
                Préparé en quantité limitée — uniquement aujourd'hui
                {platToday.priceCents !== null && <> · {fmtPrice(platToday.priceCents)}</>}.
              </p>
            </Reveal>
            <Reveal delay={140}>
              <Link
                href="/carte"
                className="pulse-ring inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 font-bold text-[#3a2a05] transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
              >
                Commander <Icon name="arrow" size={18} />
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Incontournables ──────────────────────────────── */}
      {populaires.length > 0 && (
        <section className="wrap py-16">
          <Reveal className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="font-script text-3xl text-teal">Les chouchous</p>
              <h2 className="mt-1 text-3xl sm:text-4xl">Nos incontournables</h2>
            </div>
            <Link
              href="/carte"
              className="link-underline hidden items-center gap-1.5 font-semibold text-primary sm:flex"
            >
              Toute la carte <Icon name="arrow" size={16} />
            </Link>
          </Reveal>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {populaires.map((d, i) => (
              /* La cascade suit la lecture ligne par ligne : 3 colonnes en
                 desktop, donc 90 ms par carte reste sous la seconde au total. */
              <Reveal key={d.id} delay={(i % 3) * 90 + Math.floor(i / 3) * 60} className="h-full">
                {/* Pas de `priority` ici : la section est à ~1 500 px du haut,
                    précharger ses images volerait de la bande passante au LCP,
                    qui est le collage du hero. */}
                <DishCard dish={d} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── Formules ─────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-panel-2">
        <div className="wrap relative py-16">
          <Reveal className="text-center">
            <p className="font-script text-3xl text-teal">Le bon plan</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Nos formules</h2>
          </Reveal>
          <div className="mx-auto mt-9 grid max-w-3xl gap-6 sm:grid-cols-2">
            {formules.map((f, i) => (
              <Reveal key={f.id} delay={i * 120} className="h-full">
                {/* Le prix passe en pastille pleine : c'est l'argument de la
                    section, il était noyé au même niveau que le titre. */}
                <div className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lg)]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl leading-tight">{f.name}</h3>
                    <span className="shrink-0 rounded-full bg-brick px-3.5 py-1.5 font-display text-lg text-white shadow-sm">
                      {fmtPrice(f.priceCents)}
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-sm text-ink-2">{f.desc}</p>
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1.5 text-sm font-semibold text-teal">
                    <Icon name="check" size={16} /> {f.extra}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Zones de livraison ───────────────────────────── */}
      {zones.length > 0 && (
        <section className="wrap py-16">
          <Reveal className="text-center">
            <p className="font-script text-3xl text-teal">On vient jusqu'à vous</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Zones de livraison</h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-2">Hors zone, l'à emporter reste possible.</p>
          </Reveal>

          {/* Le tarif est unique quelle que soit la zone : plus la peine de le
              répéter sur 4 cartes, un bandeau suffit et met en avant la
              livraison offerte. */}
          <Reveal delay={60} className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-[var(--radius-card)] border border-line bg-panel p-5 text-center shadow-[var(--shadow-soft)]">
            <span className="flex items-center gap-2">
              <Icon name="truck" size={20} className="text-primary" />
              <span className="text-sm">
                Frais de livraison <strong className="text-ink">{fmtPrice(zones[0].feeCents)}</strong>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Icon name="euro" size={20} className="text-primary" />
              <span className="text-sm">
                Minimum de commande <strong className="text-ink">{fmtPrice(zones[0].minimumCents)}</strong>
              </span>
            </span>
            {freeDeliveryThresholdCents !== null && (
              <span className="flex items-center gap-2">
                <Icon name="sparkle" size={20} className="text-teal" />
                <span className="text-sm">
                  Offerte dès <strong className="text-teal">{fmtPrice(freeDeliveryThresholdCents)}</strong>
                </span>
              </span>
            )}
          </Reveal>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {zones.map((z, i) => (
              <Reveal key={z.idx} delay={i * 90} className="h-full">
                <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lg)]">
                  <div className="flex items-center gap-2 text-primary">
                    <Icon name="pin" size={18} />
                    <span className="text-xs font-bold uppercase tracking-wide">Secteur {z.idx + 1}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink-2">{z.villes.join(" · ")}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── À propos teaser ──────────────────────────────── */}
      <section className="relative overflow-hidden bg-ink text-cream">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_85%_20%,color-mix(in_oklab,var(--color-primary)_20%,transparent),transparent_62%)]"
          aria-hidden="true"
        />
        <div className="wrap relative grid items-center gap-10 py-16 md:grid-cols-2">
          <Reveal>
            <p className="font-script text-3xl text-gold">Chez Laila</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Une cuisine généreuse, faite maison</h2>
            <p className="mt-4 text-cream/80">
              Ô 3 Saveurs réunit trois cultures dans une même assiette : l'Afrique de l'Ouest, le
              Maghreb et l'Asie. Des recettes familiales, des produits frais, et beaucoup d'amour —
              à déguster chez vous.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/a-propos"
                className="rounded-full border border-cream/30 px-5 py-3 font-semibold transition hover:bg-white/10"
              >
                Notre histoire
              </Link>
              <a
                href={`tel:${info.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
              >
                <Icon name="phone" size={18} /> {info.phone}
              </a>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 gap-4">
            {info.heroSpreads.slice(0, 4).map((p, i) => (
              <Reveal key={p} delay={i * 100}>
                <div
                  className={`group relative h-40 w-full overflow-hidden rounded-2xl shadow-[var(--shadow-lg)] ${
                    i % 2 ? "translate-y-4" : ""
                  }`}
                >
                  <Image
                    src={p}
                    alt="Plat Ô 3 Saveurs"
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition duration-700 ease-out group-hover:scale-110"
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
