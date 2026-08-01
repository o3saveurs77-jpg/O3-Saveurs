import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { info } from "@/lib/menu";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "À propos · Ô 3 Saveurs — Chez Laila",
  description: "L'histoire de Chez Laila : une cuisine du monde généreuse, préparée maison à Lognes.",
};

// Ce qui distingue la maison — répété par les clients, jamais écrit sur le site jusqu'ici.
const VALEURS = [
  {
    icon: "leaf" as const,
    titre: "Produits frais",
    desc: "Légumes, viandes et épices choisis chaque semaine, jamais de surgelé industriel.",
  },
  {
    icon: "flame" as const,
    titre: "Fait maison",
    desc: "Sauces, marinades et bouillons mijotent sur place, du premier au dernier service.",
  },
  {
    icon: "heart" as const,
    titre: "Recettes de famille",
    desc: "Transmises de génération en génération, sans raccourci ni recette standardisée.",
  },
];

export default function AProposPage() {
  return (
    <>
      <header className="relative overflow-hidden bg-ink text-cream">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_85%_20%,color-mix(in_oklab,var(--color-primary)_28%,transparent),transparent_62%)]"
          aria-hidden="true"
        />
        <div className="wrap relative py-16 text-center sm:py-20">
          <p className="font-script text-3xl text-gold">Chez Laila</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">Notre histoire</h1>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">
            Trois continents, une seule cuisine, faite maison chaque jour à Lognes.
          </p>
        </div>
        <div className="ots-band" />
      </header>

      {/* ── Récit + photo ─────────────────────────────────── */}
      <article className="wrap grid items-center gap-10 py-14 md:grid-cols-2">
        <Reveal className="space-y-4 text-[17px] leading-relaxed text-ink-2">
          <p>
            <strong className="text-ink">Ô 3 Saveurs — Chez Laila</strong> est née d'une envie
            simple : réunir dans une même assiette les saveurs qui ont bercé notre famille. Trois
            continents, une seule cuisine, faite maison chaque jour.
          </p>
          <p>
            De l'<strong className="text-ink">Afrique de l'Ouest</strong> (tcheb, yassa, mafé,
            athiéké), du <strong className="text-ink">Maghreb</strong> (nos tajines mijotés) et d'
            <strong className="text-ink">Asie</strong> (loc lac, bo bun, banh mì), chaque plat
            raconte un voyage.
          </p>
          <p>
            Nous travaillons des produits frais, des épices choisies et des recettes transmises de
            génération en génération. Le tout livré chez vous ou à emporter, sans rien perdre de la
            générosité de la maison.
          </p>
          <Link
            href="/carte"
            className="link-underline inline-flex items-center gap-1.5 font-semibold text-primary"
          >
            Découvrir la carte <Icon name="arrow" size={16} />
          </Link>
        </Reveal>

        <Reveal delay={120} className="grid grid-cols-2 gap-4">
          {info.heroSpreads.slice(0, 4).map((p, i) => (
            <div
              key={p}
              className={`group relative h-44 w-full overflow-hidden rounded-2xl shadow-[var(--shadow-lg)] ${
                i % 2 ? "translate-y-5" : ""
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
          ))}
        </Reveal>
      </article>

      {/* ── Valeurs ────────────────────────────────────────── */}
      <section className="bg-panel-2 py-14">
        <div className="wrap">
          <Reveal className="text-center">
            <p className="font-script text-3xl text-teal">Ce qui nous anime</p>
            <h2 className="mt-1 text-3xl sm:text-4xl">Une cuisine généreuse</h2>
          </Reveal>
          <div className="mt-9 grid gap-5 sm:grid-cols-3">
            {VALEURS.map((v, i) => (
              <Reveal key={v.titre} delay={i * 110} className="h-full">
                <div className="flex h-full flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-panel p-6 text-center shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lg)]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Icon name={v.icon} size={22} />
                  </span>
                  <h3 className="text-lg">{v.titre}</h3>
                  <p className="text-sm text-ink-2">{v.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Infos pratiques ───────────────────────────────── */}
      <section className="wrap py-14">
        <Reveal className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <h2 className="text-xl">Informations</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-ink-2">Adresse</dt>
                  <dd className="font-semibold">{info.address}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Icon name="phone" size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-ink-2">Téléphone</dt>
                  <dd className="font-semibold">
                    <a href={`tel:${info.phone.replace(/\s/g, "")}`} className="hover:text-primary">
                      {info.phone}
                    </a>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Icon name="euro" size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-ink-2">Paiements</dt>
                  <dd className="font-semibold">{info.payments.join(" · ")}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Icon name="scooter" size={18} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-ink-2">Livraison</dt>
                  <dd className="font-semibold">À domicile, à emporter & {info.partner}</dd>
                </div>
              </div>
            </dl>

            <Link
              href="/carte"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
            >
              Commander <Icon name="arrow" size={16} />
            </Link>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <h2 className="flex items-center gap-2 text-xl">
              <Icon name="clock" size={20} className="text-primary" /> Horaires
            </h2>
            <dl className="mt-5 divide-y divide-line text-sm">
              {info.hours.map((h) => (
                <div key={h.d} className="flex items-center justify-between gap-4 py-3">
                  <dt className="font-semibold">{h.d}</dt>
                  <dd className="text-right text-ink-2">{h.h}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </section>
    </>
  );
}
