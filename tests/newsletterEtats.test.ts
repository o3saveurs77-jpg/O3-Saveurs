import { describe, it, expect } from "vitest";
import {
  ETATS_CONFIRMATION,
  ETATS_DESINSCRIPTION,
  panneauConfirmation,
  panneauDesinscription,
} from "@/app/newsletter/etats";

/**
 * Ces deux pages sont lues par quelqu'un qui vient de cliquer dans un email et
 * qui n'a aucun autre moyen de savoir ce qui s'est passé. Une page qui annonce
 * le contraire de ce que la base a enregistré n'est pas un défaut d'affichage :
 * c'est une opposition qui n'a pas l'air d'avoir été prise en compte, donc un
 * signalement pour spam et une obligation légale manquée (art. L34-5 CPCE,
 * RGPD art. 21).
 *
 * D'où des tests sur le texte, chose inhabituelle — c'est ici le texte qui
 * porte la conformité.
 */

const TOUS_ETATS = [...new Set([...ETATS_CONFIRMATION, ...ETATS_DESINSCRIPTION])];

describe("page de confirmation d'inscription", () => {
  it("annonce l'inscription seulement quand la route a confirmé", () => {
    expect(panneauConfirmation("ok").ton).toBe("ok");
    for (const etat of ETATS_CONFIRMATION.filter((e) => e !== "ok")) {
      expect(panneauConfirmation(etat).ton, etat).not.toBe("ok");
    }
  });

  it("répond à chaque état émis par /api/newsletter/confirm", () => {
    // Un état connu de la route mais pas de la page afficherait le repli
    // « ce lien n'est plus valable » sur une inscription réussie.
    for (const etat of ETATS_CONFIRMATION) {
      const p = panneauConfirmation(etat);
      expect(p.titre, etat).toBeTruthy();
      expect(p.corps.length, etat).toBeGreaterThan(0);
    }
    expect(new Set(ETATS_CONFIRMATION.map((e) => panneauConfirmation(e).titre)).size).toBe(
      ETATS_CONFIRMATION.length,
    );
  });

  it("ne réinscrit pas par un vieux lien, et le dit", () => {
    const p = panneauConfirmation("desinscrit");
    expect(p.ton).toBe("attention");
    // La seule voie de retour est un nouveau consentement : d'où le formulaire.
    expect(p.formulaire).toBe(true);
  });

  it("propose de recommencer quand le jeton ne vaut rien", () => {
    const p = panneauConfirmation("invalide");
    expect(p.formulaire).toBe(true);
    expect(p.contact).toBe(true);
  });
});

describe("page de désinscription", () => {
  it("ne confirme la désinscription que sur l'état « ok »", () => {
    expect(panneauDesinscription("ok").ton).toBe("ok");
    for (const etat of ETATS_DESINSCRIPTION.filter((e) => e !== "ok")) {
      expect(panneauDesinscription(etat).ton, etat).not.toBe("ok");
    }
  });

  it("répond à chaque état émis par /api/newsletter/unsubscribe", () => {
    for (const etat of ETATS_DESINSCRIPTION) {
      const p = panneauDesinscription(etat);
      expect(p.titre, etat).toBeTruthy();
      expect(p.corps.length, etat).toBeGreaterThan(0);
    }
  });

  it("ne redemande jamais l'adresse de quelqu'un qui vient de s'opposer", () => {
    /* Poser le formulaire d'inscription juste après une désinscription réussie
     * serait de la relance déguisée. Le pied de page porte déjà le formulaire
     * pour qui change d'avis. */
    expect(panneauDesinscription("ok").formulaire).toBe(false);
    expect(panneauDesinscription("deja").formulaire).toBe(false);
  });

  it("donne une autre voie quand le lien n'a pas pu agir", () => {
    // Sans issue, la personne clique sur « indésirable » : le domaine entier
    // en paie le prix, factures et confirmations de commande comprises.
    const p = panneauDesinscription("invalide");
    expect(p.ton).toBe("attention");
    expect(p.contact).toBe(true);
    expect(p.corps.join(" ")).toContain("Contact");
  });

  it("distingue le lien de l'email d'essai d'un lien cassé", () => {
    const p = panneauDesinscription("test");
    expect(p.titre).not.toBe(panneauDesinscription("invalide").titre);
    expect(p.corps.join(" ")).toContain("essai");
  });
});

describe("paramètre d'URL hostile ou abîmé", () => {
  it("retombe sur « rien n'a eu lieu », jamais sur un succès", () => {
    /* `?etat=ok` se tape à la main, et un client de messagerie peut couper le
     * lien en deux lignes : l'absence de paramètre, la valeur inconnue et la
     * valeur répétée mènent toutes au même repli prudent. */
    for (const entree of [undefined, "", "OK", "succes", "<script>", ["ok", "invalide"]]) {
      expect(panneauConfirmation(entree).titre).toBe(panneauConfirmation("invalide").titre);
      expect(panneauDesinscription(entree).titre).toBe(panneauDesinscription("invalide").titre);
    }
  });

  it("n'emploie aucun état inventé", () => {
    // Garde-fou de relecture : si un état disparaît des routes, le test ci-dessus
    // ne couvre plus rien et celui-ci le signale.
    expect(TOUS_ETATS).toEqual(["ok", "deja", "desinscrit", "invalide", "test"]);
  });
});
