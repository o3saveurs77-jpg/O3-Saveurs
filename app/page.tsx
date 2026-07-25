import Link from "next/link";
import Image from "next/image";
import { Hero } from "@/components/home/Hero";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";
import { prisma } from "@/lib/prisma";
import { rowToDish, rowToZone } from "@/lib/serialize";
import { formules, info, fmtPrice } from "@/lib/menu";
import type { Dish, Zone } from "@/lib/menu";
import { parisNow, parisStartOfDay, WEEKDAY_LABEL } from "@/lib/hours";

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

interface PlatDuJourView {
  name: string;
  priceCents: number | null;
  jour: string;
}

/** Plats populaires, plat du jour et zones — tout depuis la base. */
async function loadHome(): Promise<{
  populaires: Dish[];
  platToday: PlatDuJourView | null;
  zones: Zone[];
}> {
  const { weekday } = parisNow();
  const today = parisStartOfDay();
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [dishRows, specialRows, zoneRows] = await Promise.all([
    prisma.dish.findMany({
      where: { popular: true, available: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      take: 6,
    }),
    prisma.dailySpecial.findMany({
      where: {
        active: true,
        OR: [{ date: { gte: today, lt: tomorrow } }, { weekday }],
      },
      orderBy: [{ position: "asc" }],
    }),
    prisma.zone.findMany({ where: { active: true }, orderBy: { idx: "asc" } }),
  ]);

  // Une date précise l'emporte sur la récurrence hebdomadaire.
  const special = specialRows.find((s) => s.date !== null) ?? specialRows[0] ?? null;

  return {
    populaires: dishRows.map(rowToDish),
    platToday: special
      ? { name: special.name, priceCents: special.priceCents, jour: WEEKDAY_LABEL[weekday] }
      : null,
    zones: zoneRows.map(rowToZone),
  };
}

export default async function HomePage() {
  let populaires: Dish[] = [];
  let platToday: PlatDuJourView | null = null;
  let zones: Zone[] = [];

  try {
    ({ populaires, platToday, zones } = await loadHome());
  } catch (error) {
    // Base indisponible : la vitrine reste lisible, sans afficher de faux prix.
    console.error("[accueil] lecture de la base échouée:", error);
  }

  return (
    <>
      <Hero />

      {/* ── Trio des saveurs ─────────────────────────────── */}
      <section className="wrap py-16">
        <div className="text-center">
          <p className="font-script text-3xl text-teal">Trois continents</p>
          <h2 className="mt-1 text-3xl sm:text-4xl">Une assiette, le monde entier</h2>
        </div>
        <div className="mt-9 grid gap-6 md:grid-cols-3">
          {SAVEURS.map((s) => (
            <Link
              key={s.cat}
              href="/carte"
              className="group relative block h-64 overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-soft)]"
            >
              <Image
                src={s.photo}
                alt={s.titre}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <h3 className="font-script text-3xl text-gold">{s.titre}</h3>
                <p className="mt-1 text-sm text-white/90">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Plat du jour ─────────────────────────────────── */}
      {platToday && (
        <section className="bg-brick text-white">
          <div className="ots-band flip" />
          <div className="wrap flex flex-col items-center gap-4 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-bold uppercase tracking-wide">
                <Icon name="sparkle" size={15} /> Plat du jour · {platToday.jour}
              </p>
              <h2 className="mt-3 font-script text-4xl text-gold sm:text-5xl">{platToday.name}</h2>
              <p className="mt-2 text-white/90">
                Préparé en quantité limitée — uniquement aujourd'hui
                {platToday.priceCents !== null && <> · {fmtPrice(platToday.priceCents)}</>}.
              </p>
            </div>
            <Link
              href="/carte"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 font-bold text-[#3a2a05] transition hover:brightness-105"
            >
              Commander <Icon name="arrow" size={18} />
            </Link>
          </div>
        </section>
      )}

      {/* ── Incontournables ──────────────────────────────── */}
      {populaires.length > 0 && (
        <section className="wrap py-16">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="font-script text-3xl text-teal">Les chouchous</p>
              <h2 className="mt-1 text-3xl sm:text-4xl">Nos incontournables</h2>
            </div>
            <Link
              href="/carte"
              className="hidden items-center gap-1.5 font-semibold text-primary hover:underline sm:flex"
            >
              Toute la carte <Icon name="arrow" size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {populaires.map((d) => (
              <DishCard key={d.id} dish={d} />
            ))}
          </div>
        </section>
      )}

      {/* ── Formules ─────────────────────────────────────── */}
      <section className="bg-panel-2">
        <div className="wrap py-16">
          <div className="text-center">
            <p className="font-script text-3xl text-teal">Le bon plan</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Nos formules</h2>
          </div>
          <div className="mx-auto mt-9 grid max-w-3xl gap-6 sm:grid-cols-2">
            {formules.map((f) => (
              <div
                key={f.id}
                className="flex flex-col rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl">{f.name}</h3>
                  <span className="font-display text-3xl text-brick">
                    {fmtPrice(f.priceCents)}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-sm text-ink-2">{f.desc}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal">
                  <Icon name="check" size={16} /> {f.extra}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Zones de livraison ───────────────────────────── */}
      {zones.length > 0 && (
        <section className="wrap py-16">
          <div className="text-center">
            <p className="font-script text-3xl text-teal">On vient jusqu'à vous</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Zones de livraison</h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-2">
              Frais et minimum de commande selon votre commune. Hors zone, l'à emporter reste
              possible.
            </p>
          </div>
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {zones.map((z) => (
              <div
                key={z.idx}
                className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                    Zone {z.idx + 1}
                  </span>
                  <Icon name="pin" size={20} className="text-primary" />
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <span>
                    <span className="block text-xs text-ink-2">Frais</span>
                    <strong className="text-brick">{fmtPrice(z.feeCents)}</strong>
                  </span>
                  <span>
                    <span className="block text-xs text-ink-2">Minimum</span>
                    <strong className="text-brick">{fmtPrice(z.minimumCents)}</strong>
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink-2">{z.villes.join(" · ")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── À propos teaser ──────────────────────────────── */}
      <section className="bg-ink text-cream">
        <div className="wrap grid items-center gap-10 py-16 md:grid-cols-2">
          <div>
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
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-white transition hover:brightness-105"
              >
                <Icon name="phone" size={18} /> {info.phone}
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {info.heroSpreads.slice(0, 4).map((p, i) => (
              <div
                key={p}
                className={`relative h-40 w-full overflow-hidden rounded-2xl shadow-[var(--shadow-lg)] ${
                  i % 2 ? "translate-y-4" : ""
                }`}
              >
                <Image
                  src={p}
                  alt="Plat Ô 3 Saveurs"
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
