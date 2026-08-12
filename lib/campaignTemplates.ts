/* Modèles d'emails de campagne — module **pur**.
 *
 * Écrire une campagne depuis une page blanche, c'est ne jamais l'écrire. Ces
 * modèles donnent un point de départ complet : sujet, structure, ton, et un
 * appel à l'action. La gérante remplit trois champs et corrige le texte plutôt
 * que d'inventer une mise en page en HTML.
 *
 * Le rendu produit le **corps** de l'email ; l'enveloppe (en-tête Ô 3 Saveurs,
 * pied de page, lien de désinscription) est ajoutée à l'envoi par
 * `sendCampaign`. Un modèle ne peut donc pas oublier le lien de
 * désinscription : il n'a pas la main dessus, et c'est voulu — il est
 * obligatoire dans toute prospection (LCEN art. L34-5, RGPD art. 21).
 *
 * Tout ce que la gérante saisit est échappé : un nom de plat contenant un
 * chevron ne doit pas pouvoir injecter de balise dans un email parti à toute
 * la liste.
 */

import { escapeHtml } from "@/lib/validate";

export type ChampType = "texte" | "ligne" | "prix" | "code" | "lien";

export interface ChampModele {
  cle: string;
  label: string;
  type: ChampType;
  /** Exemple montré dans le champ — jamais une valeur enregistrée par défaut. */
  exemple: string;
  requis: boolean;
}

export interface ModeleCampagne {
  id: string;
  label: string;
  /** Quand s'en servir, en une phrase. */
  usage: string;
  /** Sujet proposé ; les valeurs y sont substituées comme dans le corps. */
  sujet: string;
  champs: ChampModele[];
  rendre: (v: Record<string, string>) => string;
}

// ─── Fragments communs ────────────────────────────────────────

const P = (contenu: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${contenu}</p>`;

const BOUTON = (libelle: string, lien: string) =>
  `<p style="margin:22px 0 6px">
     <a href="${escapeHtml(lien)}" style="display:inline-block;background:#e8732a;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px">${escapeHtml(libelle)}</a>
   </p>`;

const ENCART = (contenu: string) =>
  `<div style="margin:0 0 16px;padding:14px;background:#fce4cf;border-radius:10px;text-align:center">${contenu}</div>`;

/** Valeur saisie, échappée. Une clé absente rend une chaîne vide, jamais « undefined ». */
const v = (values: Record<string, string>, cle: string): string =>
  escapeHtml((values[cle] ?? "").trim());

/** Substitution dans le sujet — même règle, sans échappement HTML. */
export function rendreSujet(modele: ModeleCampagne, values: Record<string, string>): string {
  return modele.sujet.replace(/\{(\w+)\}/g, (_, cle: string) => (values[cle] ?? "").trim());
}

// ─── Modèles ──────────────────────────────────────────────────

export const MODELES_CAMPAGNE: ModeleCampagne[] = [
  {
    id: "nouveaute",
    label: "Nouveau plat à la carte",
    usage: "Annoncer une entrée, un plat ou un dessert qui vient d'arriver.",
    sujet: "{plat} arrive à la carte — Ô 3 Saveurs",
    champs: [
      { cle: "plat", label: "Nom du plat", type: "ligne", exemple: "Le Thiéboudiène Poisson", requis: true },
      { cle: "description", label: "Description", type: "texte", exemple: "Riz au gras, poisson frais, légumes mijotés — la recette de Laila, celle de sa grand-mère.", requis: true },
      { cle: "prix", label: "Prix", type: "prix", exemple: "13,90 €", requis: false },
      { cle: "lien", label: "Lien", type: "lien", exemple: "https://o3saveurs.fr/carte", requis: true },
    ],
    rendre: (values) =>
      P(`<strong>${v(values, "plat")}</strong> rejoint notre carte.`) +
      P(v(values, "description")) +
      (values.prix ? ENCART(`<strong style="font-size:20px;color:#a6243a">${v(values, "prix")}</strong>`) : "") +
      BOUTON("Découvrir la carte", values.lien ?? ""),
  },

  {
    id: "promotion",
    label: "Offre avec code promo",
    usage: "Une remise limitée dans le temps. Le code doit exister dans Promotions.",
    sujet: "{titre} — Ô 3 Saveurs",
    champs: [
      { cle: "titre", label: "Titre de l'offre", type: "ligne", exemple: "−15 % sur toute la carte ce week-end", requis: true },
      { cle: "texte", label: "Texte", type: "texte", exemple: "Pour vous remercier de votre fidélité, profitez de 15 % de remise sur votre prochaine commande.", requis: true },
      { cle: "code", label: "Code promo", type: "code", exemple: "MERCI15", requis: true },
      { cle: "fin", label: "Valable jusqu'au", type: "ligne", exemple: "dimanche 17 août inclus", requis: true },
      { cle: "lien", label: "Lien", type: "lien", exemple: "https://o3saveurs.fr/carte", requis: true },
    ],
    rendre: (values) =>
      P(`<strong>${v(values, "titre")}</strong>`) +
      P(v(values, "texte")) +
      ENCART(
        `<span style="display:block;font-size:13px;color:#856a50">Votre code</span>
         <strong style="display:block;font-size:26px;letter-spacing:3px;color:#a6243a">${v(values, "code")}</strong>
         <span style="display:block;font-size:12px;color:#856a50">Valable jusqu'au ${v(values, "fin")}</span>`,
      ) +
      BOUTON("Commander maintenant", values.lien ?? "") +
      /* La mention de fin de validité figure deux fois, dans l'encart et sous
         le bouton : c'est la première question posée en retour, et un client
         qui ne la voit pas commande trop tard puis se plaint. */
      P(`<span style="font-size:13px;color:#856a50">Offre valable jusqu'au ${v(values, "fin")}, non cumulable.</span>`),
  },

  {
    id: "semaine",
    label: "Les plats du jour de la semaine",
    usage: "Le programme de la semaine, envoyé le lundi matin.",
    sujet: "Au menu cette semaine chez Ô 3 Saveurs",
    champs: [
      { cle: "intro", label: "Introduction", type: "texte", exemple: "Voici ce que Laila vous prépare cette semaine.", requis: false },
      { cle: "programme", label: "Programme (une ligne par jour)", type: "texte", exemple: "Lundi : Mafé bœuf\nMardi : Tajine poulet aux olives\nMercredi : Yassa poulet", requis: true },
      { cle: "lien", label: "Lien", type: "lien", exemple: "https://o3saveurs.fr/carte", requis: true },
    ],
    rendre: (values) =>
      (values.intro ? P(v(values, "intro")) : "") +
      `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.9">` +
      (values.programme ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join("") +
      `</ul>` +
      BOUTON("Voir la carte", values.lien ?? ""),
  },

  {
    id: "retour",
    label: "Relance d'un client qui n'est pas revenu",
    usage:
      "Pour les clients sans commande depuis longtemps. À utiliser avec parcimonie : deux relances suffisent à lasser.",
    sujet: "Vous nous manquez — Ô 3 Saveurs",
    champs: [
      { cle: "texte", label: "Message", type: "texte", exemple: "Cela fait un moment que nous ne vous avons pas vu. La carte a changé, et vos plats préférés sont toujours là.", requis: true },
      { cle: "code", label: "Code promo (facultatif)", type: "code", exemple: "RETOUR10", requis: false },
      { cle: "lien", label: "Lien", type: "lien", exemple: "https://o3saveurs.fr/carte", requis: true },
    ],
    rendre: (values) =>
      P(v(values, "texte")) +
      (values.code
        ? ENCART(
            `<span style="display:block;font-size:13px;color:#856a50">Pour votre retour</span>
             <strong style="display:block;font-size:24px;letter-spacing:3px;color:#a6243a">${v(values, "code")}</strong>`,
          )
        : "") +
      BOUTON("Retrouver la carte", values.lien ?? ""),
  },

  {
    id: "traiteur",
    label: "Offre traiteur (entreprises)",
    usage:
      "Prospection auprès d'entreprises et de comités d'entreprise. Réservez-la aux adresses professionnelles.",
    sujet: "{titre} — traiteur Ô 3 Saveurs",
    champs: [
      { cle: "titre", label: "Accroche", type: "ligne", exemple: "Vos déjeuners d'équipe, préparés maison", requis: true },
      { cle: "texte", label: "Texte", type: "texte", exemple: "Réunions, séminaires, événements : nous livrons des plateaux de cuisine du monde préparés le matin même, à Pontault-Combault et alentour.", requis: true },
      { cle: "apartir", label: "À partir de", type: "prix", exemple: "12 € par personne", requis: false },
      { cle: "lien", label: "Lien", type: "lien", exemple: "https://o3saveurs.fr/traiteur", requis: true },
    ],
    rendre: (values) =>
      P(`<strong>${v(values, "titre")}</strong>`) +
      P(v(values, "texte")) +
      (values.apartir ? ENCART(`À partir de <strong style="color:#a6243a">${v(values, "apartir")}</strong>`) : "") +
      BOUTON("Demander un devis", values.lien ?? ""),
  },

  {
    id: "info",
    label: "Information pratique",
    usage: "Fermeture, congés, nouveaux horaires, changement d'adresse.",
    sujet: "{titre} — Ô 3 Saveurs",
    champs: [
      { cle: "titre", label: "Titre", type: "ligne", exemple: "Fermeture annuelle du 10 au 24 août", requis: true },
      { cle: "texte", label: "Message", type: "texte", exemple: "Le restaurant sera fermé pour congés. Nous vous retrouvons le lundi 25 août avec une carte d'automne.", requis: true },
    ],
    rendre: (values) => P(`<strong>${v(values, "titre")}</strong>`) + P(v(values, "texte")),
  },
];

export function modeleParId(id: string): ModeleCampagne | null {
  return MODELES_CAMPAGNE.find((m) => m.id === id) ?? null;
}

/** Champs obligatoires encore vides — l'écran s'en sert pour bloquer l'envoi. */
export function champsManquants(
  modele: ModeleCampagne,
  values: Record<string, string>,
): ChampModele[] {
  return modele.champs.filter((c) => c.requis && !(values[c.cle] ?? "").trim());
}
