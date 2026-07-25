/* Briques partagées des pages légales (mentions légales, CGV, confidentialité,
 * allergènes).
 *
 * Deux partis pris :
 *
 *  · **Aucune information légale n'est inventée.** Les valeurs viennent de la
 *    table `Setting` (`lib/settings.ts`). Là où un réglage est vide, la page
 *    affiche un encadré « À compléter par le restaurant » : une mention légale
 *    fausse expose davantage qu'une mention manquante et signalée.
 *
 *  · **Une page légale ne doit jamais tomber en erreur.** Elle est le support
 *    d'obligations d'information (art. 6-III LCEN, art. 13 RGPD) : si la base
 *    est injoignable, `readSettings()` retombe sur les valeurs par défaut
 *    plutôt que de renvoyer une 500.
 *
 * Ce module lit la base : il est **réservé aux Server Components**. Ne pas
 * l'importer depuis un composant client (le `Footer` définit ses propres liens).
 */

import { Icon } from "@/components/Icon";
import { SETTING_DEFAULTS, formatAddress, getSettings, type Settings } from "@/lib/settings";

/** Date de dernière mise à jour des textes légaux, affichée en pied de page. */
export const LEGAL_UPDATED = "25 juillet 2026";

/** Réglages pour une page légale, avec repli sur les valeurs par défaut. */
export async function readSettings(): Promise<Settings> {
  try {
    return await getSettings();
  } catch {
    return { ...SETTING_DEFAULTS } as Settings;
  }
}

/** Bandeau de titre, dans la charte des autres pages publiques. */
export function LegalHero({
  kicker,
  title,
  intro,
}: {
  kicker: string;
  title: string;
  intro?: string;
}) {
  return (
    <header className="bg-primary text-white">
      <div className="wrap py-12 text-center">
        <p className="font-script text-3xl text-gold">{kicker}</p>
        <h1 className="mt-1 text-4xl sm:text-5xl">{title}</h1>
        {intro && <p className="mx-auto mt-3 max-w-2xl text-white/90">{intro}</p>}
      </div>
      <div className="ots-band" />
    </header>
  );
}

/** Colonne de lecture : largeur limitée, sections espacées. */
export function LegalBody({ children }: { children: React.ReactNode }) {
  return <div className="wrap max-w-3xl space-y-8 py-12">{children}</div>;
}

/**
 * Section de texte légal. Le titre est un `h2` : la hiérarchie doit rester
 * lisible au lecteur d'écran, `h1` étant porté par le bandeau.
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]"
    >
      <h2 className="text-xl text-brick">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-brick [&_a:hover]:underline [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Pastille signalant un réglage manquant, au fil du texte. */
export function Missing({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brick/40 bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-brick">
      <Icon name="warning" size={13} /> À compléter par le restaurant : {what}
    </span>
  );
}

/** Encadré signalant une rubrique entière non renseignée. */
export function MissingBox({ what, why }: { what: string; why?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brick/40 bg-primary-soft p-4 text-brick">
      <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-bold">À compléter par le restaurant : {what}</p>
        {why && <p className="mt-1 text-sm">{why}</p>}
      </div>
    </div>
  );
}

/** Valeur d'un réglage, ou la pastille « à compléter » si elle est vide. */
export function Value({ value, what }: { value: string; what: string }) {
  if (!value.trim()) return <Missing what={what} />;
  return <span className="font-semibold text-ink">{value}</span>;
}

/**
 * Identité du vendeur — bloc commun aux mentions légales et aux CGV.
 * Reprend les mentions exigées par l'art. 6-III de la LCEN et l'art. L111-1 du
 * code de la consommation.
 */
export function LegalNotice({ settings: s }: { settings: Settings }) {
  const rows: { label: string; value: string; what: string; optional?: boolean }[] = [
    { label: "Dénomination sociale", value: s["legal.company"], what: "la dénomination sociale" },
    { label: "Forme juridique", value: s["legal.legalForm"], what: "la forme juridique" },
    {
      label: "Capital social",
      value: s["legal.capital"],
      what: "le capital social",
      optional: true,
    },
    {
      label: "Nom commercial",
      value: [s["restaurant.name"], s["restaurant.tagline"]].filter(Boolean).join(" — "),
      what: "le nom commercial",
    },
    {
      label: "Adresse de l'établissement",
      value: formatAddress(s),
      what: "l'adresse de l'établissement",
    },
    { label: "SIRET", value: s["legal.siret"], what: "le numéro SIRET (14 chiffres)" },
    {
      label: "N° de TVA intracommunautaire",
      value: s["legal.vatNumber"],
      what: "le numéro de TVA intracommunautaire",
    },
    { label: "Téléphone", value: s["restaurant.phone"], what: "le numéro de téléphone" },
    { label: "Email", value: s["restaurant.email"], what: "l'adresse email de contact" },
  ];

  return (
    <dl className="divide-y divide-line">
      {rows
        // Le capital social ne concerne que les sociétés : masqué s'il est vide.
        .filter((r) => !r.optional || r.value.trim())
        .map((r) => (
          <div key={r.label} className="grid gap-1 py-2.5 sm:grid-cols-[13rem_1fr] sm:gap-4">
            <dt className="text-sm font-semibold text-ink-2">{r.label}</dt>
            <dd>
              <Value value={r.value} what={r.what} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
