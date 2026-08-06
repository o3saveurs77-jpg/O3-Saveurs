/* Durées de conservation des données personnelles — art. 5.1.e du RGPD.
 *
 * La politique de confidentialité (`app/confidentialite/page.tsx`) annonce une
 * durée pour chaque finalité. Jusqu'ici **rien ne les appliquait** : une durée
 * affichée mais jamais tenue est un manquement en soi, et c'est le premier
 * point que contrôle la CNIL. Ce fichier porte les seuils, la route
 * `app/api/cron/retention` les exécute.
 *
 * Le point délicat, ce sont les commandes : deux régimes cohabitent.
 *
 *  - Une commande **facturée** relève de l'obligation comptable de dix ans
 *    (art. L123-22 du code de commerce). Effacer l'identité du client à trois
 *    ans rendrait la facture inopposable — l'obligation légale l'emporte sur
 *    la durée de la relation client.
 *  - Une commande **jamais facturée** (panier abandonné, annulation avant
 *    paiement) ne relève d'aucune obligation : elle suit la relation client,
 *    trois ans.
 *
 * On **anonymise** au lieu de supprimer : montants, dates, mode de vente et
 * code postal restent nécessaires à la comptabilité et aux statistiques du
 * back-office, et cessent d'être des données personnelles une fois l'identité
 * retirée. Supprimer les lignes ferait au contraire disparaître du chiffre
 * d'affaires déjà déclaré.
 */

/** Durées en jours, une par finalité annoncée dans la politique. */
export const RETENTION_DAYS = {
  /** Relation client — commandes jamais facturées. */
  order: 3 * 365,
  /** Obligation comptable — commandes facturées (art. L123-22 c. com.). */
  invoicedOrder: 10 * 365,
  /** Messages du formulaire de contact public. */
  contactMessage: 365,
  /** Demandes de devis traiteur, décomptées depuis le dernier échange. */
  cateringInquiry: 3 * 365,
  /** Réclamations, décomptées depuis la clôture. */
  supportTicket: 3 * 365,
  /**
   * Double opt-in resté sans confirmation : l'inscription n'a jamais eu lieu,
   * la CNIL demande de ne pas conserver ces adresses indéfiniment.
   */
  unconfirmedSubscriber: 90,
  /** Désinscrits — gardés le temps de prouver qu'on a respecté l'opposition. */
  unsubscribedSubscriber: 3 * 365,
  /** Journal d'envoi des emails : donnée d'exploitation, pas de relation client. */
  emailLog: 365,
} as const;

export type RetentionKey = keyof typeof RETENTION_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Date avant laquelle une donnée n'a plus lieu d'être conservée.
 *
 * Le calcul se fait en millisecondes plutôt qu'en `setFullYear` : on veut un
 * seuil strictement monotone, insensible aux années bissextiles et aux
 * changements d'heure. Un jour de décalage sur une durée de trois ans n'a
 * aucune portée juridique, une purge non déterministe en aurait une.
 */
export function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Tous les seuils d'un coup, pour une exécution cohérente de la purge. */
export function retentionCutoffs(now: Date): Record<RetentionKey, Date> {
  const out = {} as Record<RetentionKey, Date>;
  for (const [key, days] of Object.entries(RETENTION_DAYS)) {
    out[key as RetentionKey] = cutoff(now, days);
  }
  return out;
}

/**
 * Valeurs de remplacement d'une commande anonymisée.
 *
 * `city` et `zip` sont volontairement conservés : seuls, ils ne désignent
 * personne, et ils portent la répartition par zone du tableau de bord. C'est
 * la rue et le nom qui identifient, pas la commune.
 */
export const ANONYMIZED_ORDER = {
  customerName: "Client anonymisé",
  customerEmail: "",
  customerPhone: "",
  address: null,
} as const;

/**
 * Une commande déjà anonymisée ne doit pas être retraitée à chaque passage.
 * L'email vidé sert de marqueur : il est obligatoire à la création, donc
 * jamais vide sur une commande réelle.
 */
export function isAnonymized(order: { customerEmail: string }): boolean {
  return order.customerEmail === "";
}
