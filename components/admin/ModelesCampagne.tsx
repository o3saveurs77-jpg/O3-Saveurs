"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  MODELES_CAMPAGNE,
  champsManquants,
  rendreSujet,
  type ModeleCampagne,
} from "@/lib/campaignTemplates";

/**
 * Choix d'un modèle de campagne, et remplissage de ses champs.
 *
 * Écrire une campagne depuis une page blanche, c'est ne jamais l'écrire : la
 * gérante remplit trois champs et corrige le texte, au lieu d'inventer une
 * mise en page en HTML. Le résultat alimente les champs « Objet » et
 * « Contenu » du formulaire existant — le modèle est un point de départ, pas
 * un carcan : tout reste modifiable ensuite à la main.
 */

const INPUT =
  "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-primary";

export function ModelesCampagne({
  onAppliquer,
}: {
  onAppliquer: (sujet: string, html: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [modele, setModele] = useState<ModeleCampagne | null>(null);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});

  const manquants = useMemo(
    () => (modele ? champsManquants(modele, valeurs) : []),
    [modele, valeurs],
  );

  const choisir = (m: ModeleCampagne) => {
    setModele(m);
    /* Les champs repartent vides : reprendre les valeurs du modèle précédent
       enverrait le code promo de la dernière campagne dans la suivante. */
    setValeurs({});
  };

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold transition hover:bg-panel-2"
      >
        <Icon name="sparkle" size={16} /> Partir d&apos;un modèle
      </button>
    );
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display">Modèles de campagne</h3>
        <button
          type="button"
          onClick={() => {
            setOuvert(false);
            setModele(null);
          }}
          className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold"
        >
          Fermer
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MODELES_CAMPAGNE.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => choisir(m)}
            aria-pressed={modele?.id === m.id}
            className={`rounded-xl border p-3 text-left transition ${
              modele?.id === m.id
                ? "border-primary bg-primary-soft"
                : "border-line bg-panel hover:border-primary/40"
            }`}
          >
            <span className="block text-sm font-bold">{m.label}</span>
            <span className="mt-0.5 block text-xs text-ink-2">{m.usage}</span>
          </button>
        ))}
      </div>

      {modele && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-panel p-4">
          {modele.champs.map((c) => (
            <div key={c.cle}>
              <label
                htmlFor={`modele-${c.cle}`}
                className="mb-1 block text-xs font-semibold text-ink-2"
              >
                {c.label}
                {!c.requis && <span className="font-normal"> (facultatif)</span>}
              </label>
              {c.type === "texte" ? (
                <textarea
                  id={`modele-${c.cle}`}
                  rows={3}
                  className={INPUT}
                  placeholder={c.exemple}
                  value={valeurs[c.cle] ?? ""}
                  onChange={(e) => setValeurs({ ...valeurs, [c.cle]: e.target.value })}
                />
              ) : (
                <input
                  id={`modele-${c.cle}`}
                  className={INPUT}
                  placeholder={c.exemple}
                  value={valeurs[c.cle] ?? ""}
                  onChange={(e) => setValeurs({ ...valeurs, [c.cle]: e.target.value })}
                />
              )}
            </div>
          ))}

          {/* Aperçu réel, avec le HTML produit : c'est ce que le client verra,
              à l'en-tête et au pied de page près, ajoutés à l'envoi. */}
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-2">Aperçu</p>
            <div
              className="max-h-56 overflow-y-auto rounded-lg border border-line bg-page p-4"
              dangerouslySetInnerHTML={{ __html: modele.rendre(valeurs) }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-2">
              {manquants.length === 0
                ? "Tous les champs nécessaires sont remplis."
                : `Il reste à remplir : ${manquants.map((c) => c.label.toLowerCase()).join(", ")}.`}
            </p>
            <button
              type="button"
              disabled={manquants.length > 0}
              onClick={() => {
                onAppliquer(rendreSujet(modele, valeurs), modele.rendre(valeurs));
                setOuvert(false);
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Utiliser ce modèle
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
