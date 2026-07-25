import Link from "next/link";
import { Hero } from "@/components/home/Hero";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";
import { items, zones, formules, platsDuJour, info, fmtPrice } from "@/lib/menu";

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

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function HomePage() {
  const populaires = items.filter((i) => i.popular).slice(0, 6);
  const today = JOURS[new Date().getDay()];
  const platToday = platsDuJour.find((p) => p.jour === today);

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
              className="group relative overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-soft)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.photo}
                alt={s.titre}
                className="h-64 w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
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
              <h2 className="mt-3 font-script text-4xl text-gold sm:text-5xl">{platToday.nom}</h2>
              <p className="mt-2 text-white/90">Préparé en quantité limitée — uniquement aujourd'hui.</p>
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
      <section className="wrap py-16">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="font-script text-3xl text-teal">Les chouchous</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Nos incontournables</h2>
          </div>
          <Link href="/carte" className="hidden items-center gap-1.5 font-semibold text-primary hover:underline sm:flex">
            Toute la carte <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {populaires.map((d) => (
            <DishCard key={d.id} dish={d} />
          ))}
        </div>
      </section>

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
                  <span className="font-display text-3xl text-brick">{fmtPrice(f.price)}</span>
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
          {zones.map((z, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] border border-line bg-panel p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                  Zone {i + 1}
                </span>
                <Icon name="pin" size={20} className="text-primary" />
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span>
                  <span className="block text-xs text-ink-2">Frais</span>
                  <strong className="text-brick">{fmtPrice(z.fee)}</strong>
                </span>
                <span>
                  <span className="block text-xs text-ink-2">Minimum</span>
                  <strong className="text-brick">{fmtPrice(z.min)}</strong>
                </span>
              </div>
              <p className="mt-3 text-sm text-ink-2">{z.villes.join(" · ")}</p>
            </div>
          ))}
        </div>
      </section>

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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p}
                alt="Plat Ô 3 Saveurs"
                className={`h-40 w-full rounded-2xl object-cover shadow-[var(--shadow-lg)] ${
                  i % 2 ? "translate-y-4" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
