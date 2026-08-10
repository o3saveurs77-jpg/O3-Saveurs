import { describe, it, expect } from "vitest";
import {
  BASES_LEGALES,
  BASE_LABEL,
  estJoignable,
  isBaseLegale,
  MENTION_COMPTOIR,
  OU_JOIGNABLE,
} from "@/lib/prospection";

/**
 * Écrire à quelqu'un qui n'aurait pas dû être écrit ne se rattrape pas : le
 * message est parti, et l'infraction est constituée. Ces règles se vérifient
 * donc ici, pas par un envoi d'essai.
 */

const contact = (over: Partial<Parameters<typeof estJoignable>[0]> = {}) => ({
  confirmed: false,
  unsubscribedAt: null,
  basis: "optin",
  ...over,
});

describe("qui peut recevoir une campagne", () => {
  it("un abonné ayant confirmé son inscription", () => {
    expect(estJoignable(contact({ confirmed: true }))).toBe(true);
  });

  it("un client dont l'adresse a été recueillie lors d'un achat", () => {
    /* Il n'a pas cliqué de lien de confirmation, et n'a pas à le faire :
     * l'art. L34-5 CPCE couvre la prospection vers un client existant pour des
     * produits analogues. */
    expect(estJoignable(contact({ basis: "client" }))).toBe(true);
  });

  it("mais pas un inscrit qui n'a jamais confirmé", () => {
    // Double opt-in : sans le clic, le consentement n'est pas prouvé.
    expect(estJoignable(contact({ confirmed: false, basis: "optin" }))).toBe(false);
  });

  it("et jamais quelqu'un qui s'est désinscrit", () => {
    // L'opposition prime sur toute base légale (RGPD art. 21).
    expect(estJoignable(contact({ confirmed: true, unsubscribedAt: new Date() }))).toBe(false);
    expect(estJoignable(contact({ basis: "client", unsubscribedAt: new Date() }))).toBe(false);
  });

  it("refuse une base légale inventée", () => {
    /* Une valeur inconnue ne doit pas ouvrir l'envoi par accident : seul
     * « client » dispense du consentement, pas n'importe quelle chaîne. */
    expect(estJoignable(contact({ basis: "prospect" }))).toBe(false);
    expect(estJoignable(contact({ basis: "" }))).toBe(false);
  });
});

describe("bases légales", () => {
  it("n'en reconnaît que deux", () => {
    expect(BASES_LEGALES).toEqual(["optin", "client"]);
    expect(isBaseLegale("optin")).toBe(true);
    expect(isBaseLegale("client")).toBe(true);
    expect(isBaseLegale("achete")).toBe(false);
    expect(isBaseLegale(null)).toBe(false);
  });

  it("porte un libellé pour chacune", () => {
    for (const b of BASES_LEGALES) expect(BASE_LABEL[b]).toBeTruthy();
  });
});

describe("filtre de requête", () => {
  it("exclut toujours les désinscrits", () => {
    // Le filtre et la fonction doivent dire la même chose : une divergence
    // enverrait à des gens que le code prétend exclure.
    expect(OU_JOIGNABLE.unsubscribedAt).toBeNull();
  });

  it("retient les deux bases, et elles seules", () => {
    expect(OU_JOIGNABLE.OR).toEqual([{ confirmed: true }, { basis: "client" }]);
  });
});

describe("information au comptoir", () => {
  it("annonce l'objet et la possibilité de se désinscrire", () => {
    /* L'information au moment du recueil est une condition de la base
     * « client » : sans elle, l'envoi n'est plus couvert. */
    expect(MENTION_COMPTOIR).toMatch(/désinscrire/i);
    expect(MENTION_COMPTOIR).toMatch(/email/i);
  });
});
