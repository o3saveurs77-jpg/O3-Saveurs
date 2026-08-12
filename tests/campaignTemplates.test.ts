import { describe, it, expect } from "vitest";
import {
  MODELES_CAMPAGNE,
  champsManquants,
  modeleParId,
  rendreSujet,
} from "@/lib/campaignTemplates";

/**
 * Ces modèles produisent du HTML qui part à toute la liste d'un coup. Une
 * erreur ici n'est pas rattrapable : l'email est déjà dans les boîtes.
 */

describe("catalogue", () => {
  it("décrit chaque modèle", () => {
    for (const m of MODELES_CAMPAGNE) {
      expect(m.label, m.id).toBeTruthy();
      expect(m.usage, m.id).toBeTruthy();
      expect(m.sujet, m.id).toBeTruthy();
      expect(m.champs.length, m.id).toBeGreaterThan(0);
    }
  });

  it("n'a pas deux fois le même identifiant", () => {
    const ids = MODELES_CAMPAGNE.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("se retrouve par identifiant, et refuse l'inconnu", () => {
    expect(modeleParId("promotion")?.label).toBeTruthy();
    expect(modeleParId("inexistant")).toBeNull();
  });

  it("rend chaque modèle sans lever, même sans aucune valeur", () => {
    /* L'écran affiche un aperçu dès la sélection, avant toute saisie : un
     * modèle qui suppose ses champs remplis casserait l'aperçu. */
    for (const m of MODELES_CAMPAGNE) {
      expect(() => m.rendre({}), m.id).not.toThrow();
      expect(m.rendre({}), m.id).not.toContain("undefined");
    }
  });
});

describe("échappement", () => {
  it("neutralise le HTML saisi", () => {
    /* Un nom de plat contenant une balise ne doit pas pouvoir injecter de
     * script dans un email parti à toute la liste. */
    const m = modeleParId("nouveaute")!;
    const html = m.rendre({
      plat: '<script>alert(1)</script>',
      description: "ok",
      lien: "https://o3saveurs.fr/carte",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralise aussi un lien piégé", () => {
    const m = modeleParId("nouveaute")!;
    const html = m.rendre({
      plat: "Tajine",
      description: "ok",
      lien: '" onmouseover="alert(1)',
    });
    expect(html).not.toContain('onmouseover="alert(1)"');
  });
});

describe("modèle « offre avec code promo »", () => {
  const m = modeleParId("promotion")!;
  const values = {
    titre: "−15 % ce week-end",
    texte: "Merci de votre fidélité.",
    code: "MERCI15",
    fin: "dimanche 17 août",
    lien: "https://o3saveurs.fr/carte",
  };

  it("place le code et la date de fin", () => {
    const html = m.rendre(values);
    expect(html).toContain("MERCI15");
    expect(html).toContain("dimanche 17 août");
  });

  it("rappelle la validité deux fois", () => {
    // C'est la première question posée en retour : un client qui la manque
    // commande trop tard, puis se plaint.
    const occurrences = m.rendre(values).split("dimanche 17 août").length - 1;
    expect(occurrences).toBe(2);
  });

  it("substitue le sujet", () => {
    expect(rendreSujet(m, values)).toBe("−15 % ce week-end — Ô 3 Saveurs");
  });

  it("laisse un sujet propre quand la valeur manque", () => {
    expect(rendreSujet(m, {})).toBe(" — Ô 3 Saveurs");
  });
});

describe("modèle « plats de la semaine »", () => {
  const m = modeleParId("semaine")!;

  it("transforme une ligne par jour en liste", () => {
    const html = m.rendre({
      programme: "Lundi : Mafé\nMardi : Yassa\n\n  Mercredi : Tajine  ",
      lien: "https://o3saveurs.fr/carte",
    });
    expect(html.split("<li>").length - 1).toBe(3);
    expect(html).toContain("<li>Mercredi : Tajine</li>");
  });

  it("ignore une introduction vide plutôt que de laisser un blanc", () => {
    expect(m.rendre({ programme: "Lundi : Mafé", lien: "/" })).not.toContain("<p></p>");
  });
});

describe("champs obligatoires", () => {
  it("liste ce qui manque encore", () => {
    const m = modeleParId("promotion")!;
    const manquants = champsManquants(m, { titre: "x", texte: "y" }).map((c) => c.cle);
    expect(manquants).toEqual(["code", "fin", "lien"]);
  });

  it("ne compte pas les espaces comme une saisie", () => {
    const m = modeleParId("info")!;
    expect(champsManquants(m, { titre: "   ", texte: "ok" }).map((c) => c.cle)).toEqual(["titre"]);
  });

  it("ne réclame pas les champs facultatifs", () => {
    const m = modeleParId("nouveaute")!;
    // `prix` est facultatif : une nouveauté peut s'annoncer sans prix.
    expect(
      champsManquants(m, { plat: "a", description: "b", lien: "c" }),
    ).toHaveLength(0);
  });
});
