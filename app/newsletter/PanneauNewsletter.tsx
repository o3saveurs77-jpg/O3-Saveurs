/* Rendu commun aux deux pages de newsletter.
 *
 * Ces pages sont atteintes **sans session**, depuis un client de messagerie :
 * pas de contexte, pas de panier, pas de compte. Elles sont donc entièrement
 * rendues sur le serveur et ne dépendent d'aucun JavaScript — un lien de
 * désinscription qui n'afficherait rien sans script serait un lien mort pour
 * qui lit son courrier dans un webmail restrictif.
 *
 * La charte est celle des pages vitrine (`app/contact`, `app/cgv`) : bandeau
 * grenat, bandeau décoratif, puis une colonne de lecture étroite.
 */

import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { NewsletterForm } from "@/components/NewsletterForm";
import type { Panneau, Ton } from "./etats";

/* Un ton, trois choses : l'icône, le cadre du bloc, la couleur de l'icône. Le
 * succès n'est pas grenat (la couleur des alertes du site) et l'échec n'est pas
 * vert : la couleur doit dire la même chose que la phrase. */
const TONS: Record<Ton, { icone: IconName; cadre: string; pastille: string }> = {
  ok: {
    icone: "check",
    cadre: "border-teal/30 bg-teal/5",
    pastille: "bg-teal/15 text-teal",
  },
  neutre: {
    icone: "mail",
    cadre: "border-line bg-panel",
    pastille: "bg-panel-2 text-ink-2",
  },
  attention: {
    icone: "warning",
    cadre: "border-brick/30 bg-primary-soft/40",
    pastille: "bg-primary-soft text-brick",
  },
};

export function PanneauNewsletter({
  kicker,
  panneau,
}: {
  /** Surtitre manuscrit du bandeau, comme sur les autres pages publiques. */
  kicker: string;
  panneau: Panneau;
}) {
  const ton = TONS[panneau.ton];

  return (
    <>
      <header className="bg-primary text-white">
        <div className="wrap py-12 text-center">
          <p className="font-script text-3xl text-gold">{kicker}</p>
          <h1 className="mx-auto mt-1 max-w-2xl text-3xl sm:text-4xl">{panneau.titre}</h1>
        </div>
        <div className="ots-band" />
      </header>

      <div className="wrap max-w-2xl space-y-6 py-12">
        <section
          className={`rounded-[var(--radius-card)] border p-6 shadow-[var(--shadow-soft)] ${ton.cadre}`}
        >
          <span
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${ton.pastille}`}
          >
            <Icon name={ton.icone} size={22} />
          </span>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-2">
            {panneau.corps.map((paragraphe) => (
              <p key={paragraphe}>{paragraphe}</p>
            ))}
          </div>
        </section>

        {/* La suite : on ne laisse jamais la personne dans un cul-de-sac. La
            carte d'abord — c'est ce qu'elle est venue voir un jour — puis la
            page Contact quand le lien n'a pas pu faire son travail. */}
        <nav className="flex flex-wrap gap-3">
          <Link
            href="/carte"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105"
          >
            <Icon name="list" size={18} /> Voir la carte
          </Link>
          <Link
            href="/"
            className="rounded-full border border-line bg-panel px-6 py-3 font-semibold transition hover:bg-panel-2"
          >
            Retour à l&apos;accueil
          </Link>
          {panneau.contact && (
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 font-semibold transition hover:bg-panel-2"
            >
              <Icon name="mail" size={18} className="text-primary" /> Nous écrire
            </Link>
          )}
        </nav>

        {/* Le formulaire d'inscription, uniquement là où (ré)adhérer est la
            suite logique. Il est autonome et repasse par le double opt-in :
            cette page ne peut donc pas inscrire qui que ce soit toute seule. */}
        {panneau.formulaire && (
          <div className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
            <NewsletterForm
              title="Recevoir les nouveautés"
              subtitle="Saisissez votre adresse : nous vous envoyons un email de confirmation, et rien d'autre avant votre clic."
            />
          </div>
        )}
      </div>
    </>
  );
}
