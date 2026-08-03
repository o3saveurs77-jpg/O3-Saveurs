"use client";

/* Écran Réglages.
 *
 * Tout ce qui était codé en dur (coordonnées, SIRET, taux de TVA, réseaux
 * sociaux) se saisit ici. Le bandeau d'alerte en tête est le point important :
 * tant que les informations légales manquent, les factures et les mentions
 * légales sont incomplètes, et le site ne peut pas encaisser légalement.
 *
 * Les réglages initiaux sont fournis par la page (Server Component) : pas de
 * `fetch` au montage, donc pas d'écran de chargement.
 *
 * `lib/settings.ts` n'est pas importé ici comme valeur : il ouvre une connexion
 * Prisma et n'a rien à faire dans un bundle navigateur. Seul le **type** l'est,
 * et il est effacé à la compilation.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { Settings } from "@/lib/settings";

type Draft = Record<string, string>;

interface FieldDef {
  key: keyof Settings;
  label: string;
  help?: string;
  type?: "text" | "email" | "tel" | "url" | "number" | "textarea" | "checkbox" | "select";
  placeholder?: string;
  /** unité affichée à droite du libellé (ex. « points de base ») */
  suffix?: string;
  /** choix proposés — requis pour `type: "select"` */
  options?: { value: string; label: string }[];
}

interface SectionDef {
  id: string;
  title: string;
  desc: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: "identite",
    title: "Identité et coordonnées",
    desc: "Ce que les clients voient : nom, téléphone, adresse. Repris dans le pied de page, les emails et les factures.",
    fields: [
      { key: "restaurant.name", label: "Nom du restaurant" },
      { key: "restaurant.tagline", label: "Signature", placeholder: "Chez Laila" },
      { key: "restaurant.phone", label: "Téléphone", type: "tel" },
      { key: "restaurant.email", label: "Email de contact", type: "email" },
      { key: "restaurant.address", label: "Adresse (numéro et rue)" },
      { key: "restaurant.zip", label: "Code postal", help: "5 chiffres" },
      { key: "restaurant.city", label: "Commune" },
    ],
  },
  {
    id: "legal",
    title: "Informations légales",
    desc: "Obligatoires sur les factures (art. 242 nonies A du CGI) et dans les mentions légales (art. 6-III de la LCEN). À demander à la cliente et à son comptable.",
    fields: [
      {
        key: "legal.company",
        label: "Dénomination sociale",
        help: "Le nom de l'entreprise tel qu'il figure au registre, pas l'enseigne.",
      },
      {
        key: "legal.legalForm",
        label: "Forme juridique",
        placeholder: "Entreprise individuelle, SASU, SARL…",
      },
      { key: "legal.siret", label: "SIRET", help: "14 chiffres, sans espaces." },
      {
        key: "legal.vatNumber",
        label: "N° de TVA intracommunautaire",
        help: "Format FR suivi de 11 caractères. Laisser vide si l'entreprise n'y est pas assujettie.",
        placeholder: "FR12345678901",
      },
      {
        key: "legal.capital",
        label: "Capital social",
        help: "Uniquement pour une société. Laisser vide pour une entreprise individuelle.",
      },
      {
        key: "legal.publisher",
        label: "Responsable de la publication",
        help: "Nom et prénom de la personne responsable du contenu du site.",
      },
      { key: "legal.host", label: "Hébergeur", type: "textarea" },
      {
        key: "legal.mediator",
        label: "Médiateur de la consommation",
        type: "textarea",
        help: "Nom, adresse et site du médiateur. L'adhésion à un dispositif de médiation est obligatoire (art. L612-1 du code de la consommation).",
      },
    ],
  },
  {
    id: "commercial",
    title: "Commercial",
    desc: "Taux de TVA, créneaux et moyens de paiement acceptés.",
    fields: [
      {
        key: "vat.rateBp",
        label: "Taux de TVA",
        type: "number",
        suffix: "points de base",
        help: "1000 = 10 %, taux de la vente à emporter et livrée (art. 279 m du CGI). 2000 = 20 % (alcools). À confirmer avec le comptable.",
      },
      {
        key: "order.leadTimeMinutes",
        label: "Délai de préparation",
        type: "number",
        suffix: "minutes",
      },
      { key: "order.slotStepMinutes", label: "Pas des créneaux", type: "number", suffix: "minutes" },
      {
        key: "order.slotCapacity",
        label: "Commandes maximum par créneau",
        type: "number",
      },
      {
        key: "delivery.mode",
        label: "Calcul des frais de livraison",
        type: "select",
        options: [
          { value: "zones", label: "Par zone de code postal" },
          { value: "distance", label: "Au kilomètre (distance routière)" },
        ],
        help: "« Au kilomètre » facture le trajet réel selon le barème de l'écran « Barème livraison » — deux adresses d'une même commune peuvent être à 2 et 9 km. Nécessite la clé GOOGLE_MAPS_API_KEY ; sans elle, ou si Google ne répond pas, les zones de code postal s'appliquent automatiquement.",
      },
      { key: "order.acceptCard", label: "Accepter le paiement par carte", type: "checkbox" },
      {
        key: "order.acceptCash",
        label: "Accepter les espèces à la livraison ou au retrait",
        type: "checkbox",
      },
    ],
  },
  {
    id: "social",
    title: "Réseaux sociaux",
    desc: "Les liens alimentent les icônes du pied de page. Une icône sans lien n'est pas affichée.",
    fields: [
      { key: "social.instagram", label: "Instagram", type: "url", placeholder: "https://…" },
      { key: "social.snapchat", label: "Snapchat", type: "url", placeholder: "https://…" },
      { key: "social.facebook", label: "Facebook", type: "url", placeholder: "https://…" },
    ],
  },
];

const inputClass =
  "w-full rounded-lg border border-line bg-page px-3 py-2 text-[15px] outline-none focus:border-primary";

export function ReglagesAdmin({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState<Draft>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /**
   * Même règle que `legalComplete()` de `lib/settings.ts`, réévaluée en direct
   * pendant la saisie — ce module ne peut pas être importé ici (il ouvre Prisma).
   */
  const legalOk = useMemo(
    () =>
      !!(
        draft["legal.company"]?.trim() &&
        draft["legal.legalForm"]?.trim() &&
        draft["legal.siret"]?.trim()
      ),
    [draft],
  );

  const set = (key: string, value: string) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
    setMessage(null);
  };

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json().catch(() => null)) as
        | { settings?: Settings; error?: string }
        | null;

      if (!res.ok) {
        setMessage({ tone: "error", text: data?.error ?? "Enregistrement impossible" });
        return;
      }
      if (data?.settings) setDraft({ ...data.settings });
      setMessage({ tone: "ok", text: "Réglages enregistrés." });
    } catch {
      setMessage({ tone: "error", text: "Réseau indisponible — réglages non enregistrés." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Réglages</h1>
          <p className="text-ink-2">
            Coordonnées, informations légales et paramètres commerciaux du restaurant.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-6 py-2.5 font-bold text-white hover:brightness-105 disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* Alerte de conformité : tant qu'elle est là, aucun encaissement légal. */}
      {!legalOk && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-brick/40 bg-primary-soft p-5 text-brick">
          <Icon name="warning" size={22} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-base font-bold">Informations légales incomplètes</p>
            <p className="mt-1">
              Sans dénomination sociale, forme juridique et SIRET, les{" "}
              <strong className="font-bold">factures</strong> ne comportent pas les mentions
              obligatoires de l&apos;art. 242 nonies A du CGI, et les{" "}
              <Link href="/mentions-legales" className="font-bold underline">
                mentions légales
              </Link>{" "}
              ne satisfont pas l&apos;art. 6-III de la LCEN. Le site{" "}
              <strong className="font-bold">ne peut pas encaisser légalement</strong> en l&apos;état.
            </p>
            <p className="mt-1">
              Ces informations figurent sur l&apos;avis de situation SIRENE de l&apos;entreprise.
            </p>
          </div>
        </div>
      )}

      {/* Zone de messages : jamais d'`alert()`. */}
      <div aria-live="polite" role="status">
        {message && (
          <p
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "ok"
                ? "border-teal/40 bg-panel-2 text-teal"
                : "border-brick/40 bg-primary-soft text-brick"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]"
        >
          <h2 className="text-xl">{section.title}</h2>
          <p className="mt-1 text-sm text-ink-2">{section.desc}</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {section.fields.map((f) => {
              const id = `reglage-${String(f.key).replace(/\./g, "-")}`;
              const value = draft[f.key] ?? "";
              const helpId = f.help ? `${id}-help` : undefined;

              if (f.type === "checkbox") {
                return (
                  <div key={f.key} className="flex items-start gap-3 sm:col-span-2">
                    <input
                      id={id}
                      type="checkbox"
                      checked={value === "true"}
                      onChange={(e) => set(f.key, e.target.checked ? "true" : "false")}
                      aria-describedby={helpId}
                      className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <div>
                      <label htmlFor={id} className="text-sm font-semibold">
                        {f.label}
                      </label>
                      {f.help && (
                        <p id={helpId} className="text-xs text-ink-2">
                          {f.help}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              if (f.type === "select") {
                return (
                  <div key={f.key} className="sm:col-span-2">
                    <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink-2">
                      {f.label}
                    </label>
                    <select
                      id={id}
                      value={value}
                      onChange={(e) => set(f.key, e.target.value)}
                      aria-describedby={helpId}
                      className={inputClass}
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {f.help && (
                      <p id={helpId} className="mt-1 text-xs text-ink-2">
                        {f.help}
                      </p>
                    )}
                  </div>
                );
              }

              return (
                <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                  <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink-2">
                    {f.label}
                    {f.suffix && <span className="font-normal"> ({f.suffix})</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={id}
                      rows={3}
                      value={value}
                      placeholder={f.placeholder}
                      aria-describedby={helpId}
                      onChange={(e) => set(f.key, e.target.value)}
                      className={inputClass}
                    />
                  ) : (
                    <input
                      id={id}
                      type={f.type ?? "text"}
                      value={value}
                      placeholder={f.placeholder}
                      aria-describedby={helpId}
                      onChange={(e) => set(f.key, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  {f.help && (
                    <p id={helpId} className="mt-1 text-xs text-ink-2">
                      {f.help}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* ─────────────────────────────────────────────────────────────
          Section « Horaires ».
          Emplacement réservé à `components/admin/HorairesAdmin.tsx`, écrit en
          parallèle par un autre agent (modèle `OpeningHours`, `lib/hours.ts`).
          Brancher en remplaçant le paragraphe ci-dessous par :

              <HorairesAdmin />

          et en ajoutant l'import correspondant en tête de fichier.
          ───────────────────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-card)] border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
        <h2 className="text-xl">Horaires d&apos;ouverture</h2>
        <p className="mt-1 text-sm text-ink-2">
          Services du midi et du soir, jour par jour. Ils déterminent les créneaux proposés au
          client et le refus des commandes hors service.
        </p>
        <p className="mt-4 rounded-xl border border-dashed border-line bg-panel-2 px-4 py-3 text-sm text-ink-2">
          Emplacement réservé à l&apos;éditeur d&apos;horaires (en cours d&apos;intégration).
        </p>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-6 py-2.5 font-bold text-white hover:brightness-105 disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
