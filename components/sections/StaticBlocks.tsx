/* Blocs éditoriaux : leur contenu vient entièrement du back-office.
 *
 * Chacun reprend au pixel près une mise en page qui existait déjà sur le site
 * — cartes photo de l'accueil, atouts de la page « À propos », étapes du
 * parcours de commande. Le passage en base ne change donc rien à l'apparence :
 * il rend seulement modifiable ce qui était figé dans le code.
 */

import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Reveal } from "@/components/Reveal";
import { fmtPrice } from "@/lib/menu";
import { paragraphs, type SectionContent } from "@/lib/pageSections";
import {
  Accent,
  CtaRow,
  PhotoGrid,
  SectionHeading,
  SectionWrap,
  Strong,
  gridCols,
  tone,
} from "@/components/sections/Shell";

/** Classes communes à toutes les cartes : même relief, même réaction au survol. */
const CARD =
  "flex h-full flex-col rounded-[var(--radius-card)] border p-6 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]";

// ─── En-tête de page ──────────────────────────────────────────

export function EnteteBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);
  return (
    <header className={`relative overflow-hidden ${t.wrapper}`}>
      {t.halo && (
        <div className={`pointer-events-none absolute inset-0 ${t.halo}`} aria-hidden="true" />
      )}
      <div className="wrap relative py-16 text-center sm:py-20">
        {content.eyebrow && (
          <p className={`font-script text-3xl ${t.eyebrow}`}>{content.eyebrow}</p>
        )}
        {content.title && (
          <h1 className="mt-1 text-4xl sm:text-5xl">
            <Accent text={content.title} />
          </h1>
        )}
        {content.subtitle && (
          <p className={`mx-auto mt-4 max-w-xl ${t.body}`}>{content.subtitle}</p>
        )}
      </div>
      <div className="ots-band" />
    </header>
  );
}

// ─── Cartes photo ─────────────────────────────────────────────

export function CartesBlock({ content, id }: { content: SectionContent; id?: string }) {
  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme} id={id} className="scroll-mt-20">
      <SectionHeading content={content} t={t} />
      <div className={`mt-9 grid gap-6 ${gridCols(content.columns)}`}>
        {content.items.map((item, i) => {
          /* Cascade de 110 ms : les vignettes se posent l'une après l'autre
             plutôt qu'en bloc. */
          const inner = (
            <>
              {item.photo ? (
                <Image
                  src={item.photo}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition duration-700 ease-out group-hover:scale-110"
                />
              ) : (
                <div className="ph absolute inset-0">
                  <span className="glyph">Ô3</span>
                </div>
              )}
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent transition-opacity duration-300 group-hover:from-black/90"
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <h3 className="font-script text-3xl text-gold drop-shadow-sm">{item.title}</h3>
                {item.text && <p className="mt-1 text-sm text-white/90">{item.text}</p>}
                {item.href && (
                  <span className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-bold text-gold opacity-0 transition duration-300 group-hover:opacity-100">
                    Découvrir <Icon name="arrow" size={15} />
                  </span>
                )}
              </div>
            </>
          );

          const shell =
            "group relative block h-64 overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]";

          return (
            <Reveal key={item.id} delay={i * 110}>
              {item.href ? (
                <Link href={item.href} className={shell}>
                  {inner}
                </Link>
              ) : (
                <div className={shell}>{inner}</div>
              )}
            </Reveal>
          );
        })}
      </div>
    </SectionWrap>
  );
}

// ─── Atouts (icônes) ──────────────────────────────────────────

export function AtoutsBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme}>
      <SectionHeading content={content} t={t} />
      <div className={`mt-9 grid gap-5 ${gridCols(content.columns)}`}>
        {content.items.map((item, i) => (
          <Reveal key={item.id} delay={i * 110} className="h-full">
            <div className={`${CARD} items-center gap-3 text-center ${t.card} hover:border-primary/40`}>
              {item.icon && (
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    t.dark ? "bg-white/10 text-gold" : "bg-primary-soft text-primary"
                  }`}
                >
                  <Icon name={item.icon as IconName} size={22} />
                </span>
              )}
              <h3 className="text-lg">{item.title}</h3>
              {item.text && <p className={`text-sm ${t.body}`}>{item.text}</p>}
            </div>
          </Reveal>
        ))}
      </div>
    </SectionWrap>
  );
}

// ─── Étapes numérotées ────────────────────────────────────────

export function EtapesBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme}>
      <SectionHeading content={content} t={t} />
      <div
        className={`grid gap-6 ${gridCols(content.columns)} ${
          content.eyebrow || content.title ? "mt-9" : ""
        }`}
      >
        {content.items.map((item, i) => (
          <Reveal key={item.id} delay={i * 100} className="h-full">
            <div className={`${CARD} items-center gap-2 text-center ${t.card}`}>
              <span
                className={`grid h-10 w-10 place-items-center rounded-full font-display text-lg ${
                  t.dark ? "bg-white/10 text-gold" : "bg-primary-soft text-brick"
                }`}
              >
                {i + 1}
              </span>
              <h3 className="mt-1 text-lg">{item.title}</h3>
              {item.text && <p className={`text-sm ${t.body}`}>{item.text}</p>}
            </div>
          </Reveal>
        ))}
      </div>
    </SectionWrap>
  );
}

// ─── Cartes avec prix ─────────────────────────────────────────

export function TarifsBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme}>
      <SectionHeading content={content} t={t} />
      <div className={`mx-auto mt-9 grid max-w-3xl gap-6 ${gridCols(content.columns)}`}>
        {content.items.map((item, i) => (
          <Reveal key={item.id} delay={i * 120} className="h-full">
            {/* Le prix est en pastille pleine : c'est l'argument de la section,
                il se noyait au même niveau que le titre. */}
            <div className={`${CARD} ${t.card} hover:border-primary/40`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl leading-tight">{item.title}</h3>
                {item.priceCents !== null && (
                  <span className="shrink-0 rounded-full bg-brick px-3.5 py-1.5 font-display text-lg text-white shadow-sm">
                    {fmtPrice(item.priceCents)}
                  </span>
                )}
              </div>
              {item.text && <p className={`mt-3 flex-1 text-sm ${t.body}`}>{item.text}</p>}
              {item.badge && (
                <p
                  className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                    t.dark ? "bg-white/10 text-gold" : "bg-teal/10 text-teal"
                  }`}
                >
                  <Icon name="check" size={16} /> {item.badge}
                </p>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </SectionWrap>
  );
}

// ─── Texte & photos ───────────────────────────────────────────

export function TexteImagesBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);
  const paras = paragraphs(content.body);

  return (
    <SectionWrap theme={content.theme}>
      <div className="grid items-center gap-10 md:grid-cols-2">
        {/* `md:order-2` plutôt qu'un `flex-row-reverse` : l'ordre de lecture au
            clavier et pour un lecteur d'écran reste celui du DOM. */}
        <Reveal className={content.reverse ? "md:order-2" : ""}>
          {content.eyebrow && (
            <p className={`font-script text-3xl ${t.eyebrow}`}>{content.eyebrow}</p>
          )}
          {content.title && (
            <h2 className="mt-1 text-3xl sm:text-4xl">
              <Accent text={content.title} />
            </h2>
          )}
          <div className={`mt-4 space-y-4 text-[17px] leading-relaxed ${t.body}`}>
            {paras.map((p, i) => (
              <p key={i}>
                <Strong text={p} className={t.dark ? "text-cream" : "text-ink"} />
              </p>
            ))}
          </div>
          <CtaRow content={content} t={t} className="mt-6" />
        </Reveal>

        <div className={content.reverse ? "md:order-1" : ""}>
          <PhotoGrid photos={content.photos} columns={2} height="h-40 sm:h-44" />
        </div>
      </div>
    </SectionWrap>
  );
}

// ─── Galerie ──────────────────────────────────────────────────

export function GalerieBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);

  return (
    <SectionWrap theme={content.theme}>
      <SectionHeading content={content} t={t} />
      <div className={`mt-9 grid grid-cols-2 gap-4 ${gridCols(content.columns)}`}>
        {content.photos.map((src, i) => (
          <Reveal key={`${src}-${i}`} delay={i * 80}>
            <div className="group relative h-44 w-full overflow-hidden rounded-2xl shadow-[var(--shadow-lg)] sm:h-52">
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition duration-700 ease-out group-hover:scale-110"
              />
            </div>
          </Reveal>
        ))}
      </div>
    </SectionWrap>
  );
}

// ─── Appel à l'action ─────────────────────────────────────────

export function AppelActionBlock({ content }: { content: SectionContent }) {
  const t = tone(content.theme);
  const paras = paragraphs(content.body);

  return (
    <SectionWrap theme={content.theme}>
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
        <Reveal>
          {content.eyebrow && (
            <p className={`font-script text-3xl ${t.eyebrow}`}>{content.eyebrow}</p>
          )}
          {content.title && (
            <h2 className="mt-1 text-3xl sm:text-4xl">
              <Accent text={content.title} />
            </h2>
          )}
          {paras.map((p, i) => (
            <p key={i} className={`mt-2 ${t.body}`}>
              <Strong text={p} className={t.dark ? "text-cream" : "text-ink"} />
            </p>
          ))}
        </Reveal>
        <Reveal delay={140}>
          <CtaRow content={content} t={t} className="justify-center sm:justify-end" />
        </Reveal>
      </div>
    </SectionWrap>
  );
}
