/* Qui peut recevoir une campagne, et à quel titre — règles pures.
 *
 * La prospection par email n'est pas libre. Deux bases légales seulement, et
 * elles sont toutes deux tenues ici plutôt que dispersées dans les requêtes :
 *
 *  · **le consentement** — la personne s'est inscrite et a cliqué le lien de
 *    confirmation (double opt-in) ;
 *  · **le client existant** — l'adresse a été recueillie *à l'occasion d'une
 *    vente*, ce qui autorise la prospection pour des produits analogues sans
 *    consentement préalable (art. L34-5 CPCE), à deux conditions : informer la
 *    personne au moment du recueil, et offrir la désinscription dans chaque
 *    envoi.
 *
 * Une adresse désinscrite n'est jamais joignable, quelle que soit la base :
 * l'opposition prime sur tout (RGPD art. 21).
 *
 * Ces règles vivent dans un module pur pour être vérifiables par des tests
 * plutôt que par un envoi de masse — qu'on ne rattrape pas.
 */

export const BASES_LEGALES = ["optin", "client"] as const;
export type BaseLegale = (typeof BASES_LEGALES)[number];

export function isBaseLegale(v: unknown): v is BaseLegale {
  return typeof v === "string" && (BASES_LEGALES as readonly string[]).includes(v);
}

export const BASE_LABEL: Record<BaseLegale, string> = {
  optin: "Inscrit à la newsletter",
  client: "Client (adresse recueillie lors d'un achat)",
};

export interface Contact {
  confirmed: boolean;
  unsubscribedAt: Date | number | null;
  basis: string;
}

/**
 * Cette adresse peut-elle recevoir une campagne ?
 *
 * Un client recueilli en boutique n'a pas cliqué de lien de confirmation — et
 * n'a pas à le faire. Exiger `confirmed` de lui reviendrait à s'interdire une
 * prospection que la loi autorise ; l'en dispenser sans tracer la base légale
 * reviendrait à ne pas pouvoir la justifier. D'où les deux conditions.
 */
export function estJoignable(c: Contact): boolean {
  if (c.unsubscribedAt !== null) return false;
  return c.confirmed || c.basis === "client";
}

/**
 * Filtre `where` Prisma correspondant, pour ne pas réécrire la règle à chaque
 * requête — et pour qu'un oubli soit impossible.
 */
export const OU_JOIGNABLE = {
  unsubscribedAt: null,
  OR: [{ confirmed: true }, { basis: "client" }],
};

/**
 * Mention à afficher au comptoir avant de saisir une adresse.
 *
 * L'information au moment du recueil est une **condition** de la base
 * « client » : sans elle, l'envoi n'est plus couvert. La phrase est ici pour
 * que l'écran la montre, et non dans un coin de la documentation que personne
 * ne rouvre.
 */
export const MENTION_COMPTOIR =
  "Dites au client : « Je note votre email pour vous prévenir de nos nouveautés et " +
  "offres ? Vous pourrez vous désinscrire à tout moment, en un clic. »";
