/* Blocs reliés aux données métier.
 *
 * Leur contenu n'est **pas** ressaisi dans l'éditeur : il vient des écrans qui
 * en sont responsables — Plats, Mise en avant, Zones, Réglages. Le back-office
 * n'y règle que l'habillage (titres, fond, nombre de colonnes) et la présence
 * du bloc. Sans cette séparation, un prix vivrait à deux endroits et l'un des
 * deux finirait faux.
 *
 * Chaque bloc disparaît quand sa source est vide : mieux vaut une section en
 * moins qu'une grille vide ou un tarif inventé.
 */

import Link from "next/link";
import { DishCard } from "@/components/DishCard";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { fmtPrice } from "@/lib/menu";
import { formulaSupplements, isFormulaOrderable } from "@/lib/formulas";
import type { SectionContent } from "@/lib/pageSections";
import type { SectionContext } from "@/lib/pageContent";
import { Accent, SectionHeading, SectionWrap, gridCols, tone } from "@/components/sections/Shell";

// ─── Plats mis en avant ───────────────────────────────────────

export function PlatsPopulairesBlock({
  content,
  ctx,
}: {
  content: SectionContent;
  ctx: SectionContext;
}) {
  const plats = ctx.populaires.slice(0, content.limit);
  if (!plats.length) return null;

  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme}>
      <Reveal className="mb-7 flex items-end justify-between gap-4">
        <div>
          {content.eyebrow && (
            <p className={`font-script text-3xl ${t.eyebrow}`}>{content.eyebrow}</p>
          )}
          {content.title && (
            <h2 className="mt-1 text-3xl sm:text-4xl">
              <Accent text={content.title} />
            </h2>
          )}
          {content.subtitle && <p className={`mt-2 text-[15px] ${t.body}`}>{content.subtitle}</p>}
        </div>
        {content.ctaLabel && content.ctaHref && (
          <Link
            href={content.ctaHref}
            className="link-underline hidden items-center gap-1.5 font-semibold text-primary sm:flex"
          >
            {content.ctaLabel} <Icon name="arrow" size={16} />
          </Link>
        )}
      </Reveal>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {plats.map((d, i) => (
          /* La cascade suit la lecture ligne par ligne : 3 colonnes en desktop,
             donc 90 ms par carte reste sous la seconde au total. */
          <Reveal key={d.id} delay={(i % 3) * 90 + Math.floor(i / 3) * 60} className="h-full">
            <DishCard dish={d} />
          </Reveal>
        ))}
      </div>
    </SectionWrap>
  );
}

// ─── Plat du jour ─────────────────────────────────────────────

export function PlatDuJourBlock({
  content,
  ctx,
}: {
  content: SectionContent;
  ctx: SectionContext;
}) {
  const plat = ctx.platToday;
  if (!plat) return null; // aucun plat programmé aujourd'hui

  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme} pad="py-12">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <Reveal>
          <p
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide backdrop-blur ${
              t.dark ? "bg-white/15" : "bg-primary-soft text-brick"
            }`}
          >
            <Icon name="sparkle" size={15} /> {content.eyebrow || "Plat du jour"} · {plat.jour}
          </p>
          <h2 className="mt-3 font-script text-4xl text-gold sm:text-5xl">{plat.name}</h2>
          <p className={`mt-2 ${t.body}`}>
            {content.subtitle}
            {plat.priceCents !== null && <> · {fmtPrice(plat.priceCents)}</>}
          </p>
        </Reveal>
        {content.ctaLabel && content.ctaHref && (
          <Reveal delay={140}>
            <Link
              href={content.ctaHref}
              className="pulse-ring inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 font-bold text-[#3a2a05] transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
            >
              {content.ctaLabel} <Icon name="arrow" size={18} />
            </Link>
          </Reveal>
        )}
      </div>
    </SectionWrap>
  );
}

// ─── Formules ─────────────────────────────────────────────────

/**
 * Chaque carte mène à l'assistant de composition (`/formules#F3`) : la formule
 * est réellement commandable, à son tarif, et le client choisit ses plats
 * créneau par créneau. Une formule dont un créneau obligatoire est vide n'est
 * pas proposée — l'annoncer puis la refuser au moment de payer serait pire que
 * de ne pas l'afficher.
 */
export function FormulesBlock({ content, ctx }: { content: SectionContent; ctx: SectionContext }) {
  const formules = ctx.formules.slice(0, content.limit);
  if (!formules.length) return null;

  const t = tone(content.theme);

  /* Suppléments annoncés sous le titre : déduits des formules elles-mêmes, pour
   * qu'un tarif changé au back-office ne laisse pas une mention périmée ici. */
  const supplements = [
    ...new Map(formules.flatMap(formulaSupplements).map((s) => [s.name, s])).values(),
  ].sort((a, b) => a.cents - b.cents);

  return (
    <SectionWrap theme={content.theme} id="formules" className="scroll-mt-20">
      <SectionHeading content={content} t={t} />
      {supplements.length > 0 && (
        <p className={`mx-auto mt-2 max-w-2xl text-center text-sm ${t.body}`}>
          Suppléments :{" "}
          {supplements.map((s, i) => (
            <span key={s.name}>
              {i > 0 && " · "}
              {s.name} +{fmtPrice(s.cents)}
            </span>
          ))}
        </p>
      )}

      {/* La description passe en `flex-1`, si bien que prix et bouton restent
          alignés d'une carte à l'autre même quand un intitulé prend deux
          lignes. */}
      <div className={`mt-9 grid gap-5 ${gridCols(content.columns)}`}>
        {formules.map((f, i) => {
          const orderable = isFormulaOrderable(f);
          return (
            <Reveal key={f.id} delay={i * 90} className="h-full">
              <div
                className={`group flex h-full flex-col rounded-[var(--radius-card)] border p-5 text-center shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lg)] ${t.card}`}
              >
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brick font-display text-sm text-white">
                  {f.code}
                </span>
                <h3 className="mt-3 text-lg leading-tight">{f.name}</h3>
                <p className={`mt-1.5 flex-1 text-sm ${t.body}`}>{f.desc}</p>
                <p className={`mt-3 font-display text-3xl ${t.dark ? "text-gold" : "text-brick"}`}>
                  {fmtPrice(f.priceCents)}
                </p>
                <Link
                  href={orderable ? `/formules#${f.code}` : "/formules"}
                  aria-disabled={!orderable}
                  className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 font-bold transition ${
                    orderable
                      ? "bg-primary text-white hover:brightness-105"
                      : `pointer-events-none border ${t.dark ? "border-white/25 text-cream/60" : "border-line text-ink-2"}`
                  }`}
                >
                  {orderable ? (
                    <>
                      <Icon name="plus" size={16} /> Choisir
                    </>
                  ) : (
                    "Indisponible"
                  )}
                </Link>
              </div>
            </Reveal>
          );
        })}
      </div>
    </SectionWrap>
  );
}

// ─── Zones de livraison ───────────────────────────────────────

export function ZonesBlock({ content, ctx }: { content: SectionContent; ctx: SectionContext }) {
  const { zones, freeDeliveryThresholdCents } = ctx;
  if (!zones.length) return null;

  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme}>
      <SectionHeading content={content} t={t} />

      {/* Le tarif varie par secteur : le bandeau annonce le plus bas, chaque
          carte porte le sien plutôt qu'une valeur unique supposée valable
          partout. */}
      <Reveal
        delay={60}
        className={`mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-[var(--radius-card)] border p-5 text-center shadow-[var(--shadow-soft)] ${t.card}`}
      >
        <span className="flex items-center gap-2">
          <Icon name="truck" size={20} className="text-primary" />
          <span className="text-sm">
            Dès <strong>{fmtPrice(Math.min(...zones.map((z) => z.feeCents)))}</strong> de frais de
            livraison
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Icon name="euro" size={20} className="text-primary" />
          <span className="text-sm">
            Dès <strong>{fmtPrice(Math.min(...zones.map((z) => z.minimumCents)))}</strong> de
            minimum de commande
          </span>
        </span>
        {freeDeliveryThresholdCents !== null && (
          <span className="flex items-center gap-2">
            <Icon name="sparkle" size={20} className="text-teal" />
            <span className="text-sm">
              Livraison offerte dès{" "}
              <strong className="text-teal">{fmtPrice(freeDeliveryThresholdCents)}</strong>
            </span>
          </span>
        )}
      </Reveal>

      <div className={`mt-6 grid gap-5 ${gridCols(content.columns)}`}>
        {zones.map((z, i) => (
          <Reveal key={z.idx} delay={i * 90} className="h-full">
            <div
              className={`flex h-full flex-col rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lg)] ${t.card}`}
            >
              <div className="flex items-center gap-2 text-primary">
                <Icon name="pin" size={18} />
                <span className="text-xs font-bold uppercase tracking-wide">
                  Secteur {z.idx + 1}
                </span>
              </div>
              <p className={`mt-3 text-sm leading-relaxed ${t.body}`}>{z.villes.join(" · ")}</p>
              <p className="mt-3 text-sm font-semibold">
                {fmtPrice(z.feeCents)} de livraison · min. {fmtPrice(z.minimumCents)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionWrap>
  );
}

// ─── Informations & horaires ──────────────────────────────────

export function InfosPratiquesBlock({
  content,
  ctx,
}: {
  content: SectionContent;
  ctx: SectionContext;
}) {
  const p = ctx.practical;
  if (!p) return null;

  const t = tone(content.theme);
  const card = `rounded-[var(--radius-card)] border p-6 shadow-[var(--shadow-soft)] ${t.card}`;

  return (
    <SectionWrap theme={content.theme}>
      <Reveal className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className={card}>
          <h2 className="text-xl">{content.title || "Informations"}</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <dt className={t.body}>Adresse</dt>
                <dd className="font-semibold">{p.address}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icon name="phone" size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <dt className={t.body}>Téléphone</dt>
                <dd className="font-semibold">
                  <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="hover:text-primary">
                    {p.phone}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icon name="euro" size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <dt className={t.body}>Paiements</dt>
                <dd className="font-semibold">{p.payments.join(" · ")}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icon name="scooter" size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <dt className={t.body}>Livraison</dt>
                <dd className="font-semibold">À domicile, à emporter & {p.partner}</dd>
              </div>
            </div>
          </dl>

          {content.ctaLabel && content.ctaHref && (
            <Link
              href={content.ctaHref}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
            >
              {content.ctaLabel} <Icon name="arrow" size={16} />
            </Link>
          )}
        </div>

        <div className={card}>
          <h2 className="flex items-center gap-2 text-xl">
            <Icon name="clock" size={20} className="text-primary" />{" "}
            {content.subtitle || "Horaires"}
          </h2>
          <dl className={`mt-5 divide-y text-sm ${t.dark ? "divide-white/15" : "divide-line"}`}>
            {p.hours.map((h) => (
              <div key={h.jour} className="flex items-center justify-between gap-4 py-3">
                <dt className="font-semibold">{h.jour}</dt>
                <dd className={`text-right ${t.body}`}>{h.horaire}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </SectionWrap>
  );
}
