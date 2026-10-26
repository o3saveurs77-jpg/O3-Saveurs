/* Ce que racontent les deux pages de newsletter, selon ce qui vient de se passer.
 *
 * Les routes `/api/newsletter/confirm` et `/api/newsletter/unsubscribe` font le
 * travail en base — valider le consentement, horodater l'opposition — puis
 * redirigent vers `/newsletter/confirmation` ou `/newsletter/desinscription`
 * avec un `?etat=…`. Ces deux pages n'existaient pas : les deux adresses
 * renvoyaient une 404. Celui qui cliquait « Je confirme » se croyait non
 * inscrit, celui qui se désinscrivait se croyait toujours abonné et signalait
 * l'expéditeur — ce qui abîme la réputation du domaine d'envoi pour tout le
 * monde, commandes comprises. L'opposition doit être effective **et visible**
 * (art. L34-5 CPCE, RGPD art. 21).
 *
 * Deux partis pris tiennent ce module :
 *
 *  · **Le paramètre d'URL n'est pas une donnée de confiance.** Il arrive par
 *    un `GET` depuis un client de messagerie, et n'importe qui peut taper
 *    `?etat=ok`. C'est sans conséquence ici : ces pages ne lisent ni n'écrivent
 *    rien, elles décrivent. Mais un état inconnu, ou absent, ne doit jamais
 *    retomber sur « c'est fait » : un lien coupé en deux lignes par Outlook
 *    annoncerait alors une désinscription qui n'a pas eu lieu. D'où une table
 *    fermée et un repli explicite sur « ce lien n'a rien pu faire ».
 *
 *  · **Le texte est séparé du rendu** pour être vérifiable par un test. Une
 *    page qui annonce le contraire de ce que la base a enregistré n'est pas un
 *    défaut d'affichage, c'est un défaut de conformité.
 */

/** Teinte du panneau : ce qui s'est passé est-il un succès, un constat, un ennui ? */
export type Ton = "ok" | "neutre" | "attention";

export interface Panneau {
  /** Ce qui vient de se passer, en une phrase. Porté par le `h1`. */
  titre: string;
  /** Les conséquences, et surtout ce qui **ne** s'est **pas** passé. */
  corps: string[];
  ton: Ton;
  /**
   * Poser le formulaire d'inscription sur la page : seulement quand se
   * (ré)inscrire est la suite utile, jamais juste après une désinscription —
   * redemander l'adresse à quelqu'un qui vient de s'opposer serait au mieux
   * maladroit, au pire de la relance déguisée.
   */
  formulaire: boolean;
  /** Proposer la page Contact : la personne a besoin d'un humain. */
  contact: boolean;
}

/** États émis par `GET /api/newsletter/confirm`. */
export const ETATS_CONFIRMATION = ["ok", "deja", "desinscrit", "invalide"] as const;

/** États émis par `GET /api/newsletter/unsubscribe`, plus l'essai de campagne. */
export const ETATS_DESINSCRIPTION = ["ok", "deja", "test", "invalide"] as const;

/**
 * Normalise le paramètre d'URL.
 *
 * `searchParams` rend un tableau quand la clé est répétée (`?etat=ok&etat=x`).
 * Deux états contradictoires ne se tranchent pas : on retombe sur le repli.
 */
function lire(etat: string | string[] | undefined): string {
  return typeof etat === "string" ? etat : "";
}

/** Panneau de `/newsletter/confirmation`. */
export function panneauConfirmation(etat: string | string[] | undefined): Panneau {
  switch (lire(etat)) {
    case "ok":
      return {
        titre: "C'est confirmé, vous êtes inscrit(e)",
        corps: [
          "Votre adresse est enregistrée : vous recevrez les nouveautés d'Ô 3 Saveurs, les plats du jour et les offres. Quelques emails, jamais plus.",
          "Chaque envoi porte un lien de désinscription qui agit en un seul clic, sans compte ni mot de passe.",
        ],
        ton: "ok",
        formulaire: false,
        contact: false,
      };

    case "deja":
      return {
        titre: "Votre inscription était déjà confirmée",
        corps: [
          "Rien de plus à faire : cette adresse figure déjà dans la liste. Ce lien a probablement été ouvert deux fois.",
          "Vous continuerez à recevoir nos emails, chacun avec son lien de désinscription.",
        ],
        ton: "neutre",
        formulaire: false,
        contact: false,
      };

    case "desinscrit":
      return {
        titre: "Ce lien ne vous réinscrit pas",
        corps: [
          "Cette adresse s'est désinscrite. Un ancien lien de confirmation ne peut pas défaire cette opposition : ce serait vous réinscrire sans vous le demander.",
          "Si vous souhaitez revenir, l'inscription se refait ci-dessous. Vous recevrez un nouvel email de confirmation : rien ne part avant ce clic.",
        ],
        ton: "attention",
        formulaire: true,
        contact: false,
      };

    /* Jeton absent, inconnu, ou état que la route n'émet pas : dans tous les
     * cas, rien n'a été confirmé, et la page doit le dire plutôt que de laisser
     * croire à une inscription active. */
    default:
      return {
        titre: "Ce lien n'est plus valable",
        corps: [
          "Le lien était incomplet, déjà utilisé ou trop ancien. Certains clients de messagerie coupent les adresses longues sur deux lignes, et seule la première est suivie.",
          "Votre inscription n'a donc pas été confirmée, et aucune campagne ne partira vers cette adresse. Pour la confirmer, recommencez ci-dessous : nous vous renvoyons un email.",
        ],
        ton: "attention",
        formulaire: true,
        contact: true,
      };
  }
}

/** Panneau de `/newsletter/desinscription`. */
export function panneauDesinscription(etat: string | string[] | undefined): Panneau {
  switch (lire(etat)) {
    case "ok":
      return {
        titre: "C'est fait, vous ne recevrez plus nos emails",
        corps: [
          "Votre désinscription est enregistrée et prend effet immédiatement : aucune campagne ne partira plus vers cette adresse.",
          "Nous gardons votre adresse pour une seule raison — se souvenir de votre refus. C'est ce qui empêche un futur import de fichier de vous réinscrire à votre insu.",
          "Vous pourrez continuer à recevoir les emails liés à une commande (confirmation, facture) : ceux-là ne sont pas de la prospection, et la loi nous oblige à vous les adresser.",
        ],
        ton: "ok",
        formulaire: false,
        contact: false,
      };

    case "deja":
      return {
        titre: "Vous étiez déjà désinscrit(e)",
        corps: [
          "Cette adresse ne reçoit plus nos campagnes depuis votre précédente demande. Ce lien a sans doute été ouvert deux fois.",
          "Si une campagne vous est parvenue depuis, dites-le-nous : c'est une anomalie que nous voulons corriger.",
        ],
        ton: "neutre",
        formulaire: false,
        contact: true,
      };

    /* Lien de l'email d'essai, envoyé depuis le back-office avant une campagne.
     * Il ne porte pas de jeton — un essai ne doit désinscrire personne, surtout
     * pas la personne qui le relit. Le dire franchement évite de croire que le
     * lien de désinscription de la campagne est cassé. */
    case "test":
      return {
        titre: "Lien de test : personne n'a été désinscrit",
        corps: [
          "Cet email est l'essai envoyé depuis le back-office avant une campagne. Son lien de désinscription ne porte pas de jeton : aucune adresse n'a été retirée de la liste.",
          "Dans la campagne réelle, ce même lien désinscrit son destinataire en un clic, sans connexion.",
        ],
        ton: "neutre",
        formulaire: false,
        contact: false,
      };

    /* Le cas le plus sensible : la personne a *voulu* se désinscrire et le lien
     * n'a pas pu agir. Lui répondre « lien invalide » et s'arrêter là, c'est
     * l'inviter à cliquer sur « signaler comme indésirable ». On lui donne donc
     * l'autre voie, qui ne dépend d'aucun jeton. */
    default:
      return {
        titre: "Nous n'avons pas pu vous désinscrire",
        corps: [
          "Aucune désinscription n'a été enregistrée : le lien était incomplet, ou il ne correspond à aucune inscription. Certains clients de messagerie coupent les adresses longues sur deux lignes.",
          "Votre demande reste entière, et elle ne dépend pas de ce lien : écrivez-nous depuis la page Contact avec la mention « désinscription », ou répondez simplement à l'un de nos emails. Nous la traitons à la main, sans vous demander de compte.",
        ],
        ton: "attention",
        formulaire: false,
        contact: true,
      };
  }
}
