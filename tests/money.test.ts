/* Lecture d'une saisie monétaire — `lib/money.ts`.
 *
 * Ces tests existent à cause d'un enchaînement précis : les formulaires
 * d'administration sont préremplis par `toEuros`, qui écrit « 25,00 » ; les
 * écrans lisaient ensuite `toCents(Number(saisie) || 0)` ; `Number("25,00")`
 * vaut `NaN` ; `|| 0` le transformait en 0. Rouvrir « −10 % dès 25 € » pour
 * corriger sa date de fin la réenregistrait donc « dès le premier euro », et
 * renommer un plat du jour l'annonçait à 0,00 € sur l'accueil.
 *
 * La règle vérifiée ici est donc toujours la même : **une saisie qu'on ne sait
 * pas lire doit être refusée, jamais convertie en montant plausible.**
 */

import { describe, it, expect } from "vitest";
import { lireMontant, toCents, toEuros, MONTANT_MAX_CENTS } from "@/lib/money";

/** Raccourci : les centimes lus, ou `undefined` si la saisie est refusée. */
const cents = (saisie: unknown, opts?: Parameters<typeof lireMontant>[2]) => {
  const lu = lireMontant(saisie, "Le prix", opts);
  return lu.ok ? lu.cents : undefined;
};

/** Raccourci : le message de refus, ou `null` si la saisie passe. */
const refus = (saisie: unknown, opts?: Parameters<typeof lireMontant>[2]) => {
  const lu = lireMontant(saisie, "Le prix", opts);
  return lu.ok ? null : lu.error;
};

describe("lireMontant — séparateur décimal", () => {
  it("accepte la virgule française", () => {
    expect(cents("12,50")).toBe(1250);
  });

  it("accepte le point", () => {
    expect(cents("12.50")).toBe(1250);
  });

  it("lit « 25,00 », la valeur même qui tombait à 0", () => {
    // Exactement ce que `toEuros(2500)` produit et que le formulaire préremplit.
    expect(cents("25,00")).toBe(2500);
  });

  it("accepte un nombre déjà numérique", () => {
    expect(cents(12.5)).toBe(1250);
    expect(cents(0)).toBe(0);
  });

  it("tolère une saisie en cours de frappe", () => {
    // « 5, » est l'état du champ entre le 5 et les centimes : refuser ici
    // afficherait une erreur à chaque caractère tapé.
    expect(cents("5,")).toBe(500);
    expect(cents(",5")).toBe(50);
  });
});

describe("lireMontant — champ vide", () => {
  it("refuse un champ vide quand le montant est requis", () => {
    expect(refus("")).toBe("Le prix est requis.");
  });

  it("accepte un champ vide quand le montant est facultatif, et rend null", () => {
    expect(cents("", { requis: false })).toBeNull();
  });

  it("traite un champ qui ne contient que des espaces comme vide, pas comme zéro", () => {
    // C'est l'état d'un champ qu'on vient d'effacer pour le retaper. L'ancienne
    // version rendait 0, parce que `Number("")` vaut zéro.
    expect(refus("   ")).toBe("Le prix est requis.");
    expect(cents("   ", { requis: false })).toBeNull();
    expect(cents("\u00a0\u202f", { requis: false })).toBeNull();
  });

  it("traite null et undefined comme un champ vide", () => {
    expect(cents(null, { requis: false })).toBeNull();
    expect(cents(undefined, { requis: false })).toBeNull();
    expect(refus(null)).toBe("Le prix est requis.");
  });
});

describe("lireMontant — espaces et symboles", () => {
  it("accepte un séparateur de milliers", () => {
    expect(cents("1 234,50")).toBe(123450);
    expect(cents("1\u00a0234,50")).toBe(123450); // espace insécable
    expect(cents("1\u202f234,50")).toBe(123450); // fine insécable, celle de Intl
  });

  it("accepte le symbole euro collé ou séparé", () => {
    expect(cents("12,50 €")).toBe(1250);
    expect(cents("€12,50")).toBe(1250);
  });

  it("relit ce que le site affiche", () => {
    // Un copier-coller depuis la carte ou depuis une facture doit se relire.
    expect(cents(toEuros(1197))).toBe(1197);
  });
});

describe("lireMontant — saisie absurde", () => {
  it("refuse du texte", () => {
    expect(refus("abc")).toMatch(/ne se lit pas/);
    expect(refus("gratuit")).toMatch(/ne se lit pas/);
  });

  it("refuse une saisie partiellement numérique", () => {
    expect(refus("12 euros et des miettes")).toMatch(/ne se lit pas/);
    expect(refus("12,34,56")).toMatch(/ne se lit pas/);
    expect(refus("--5")).toMatch(/ne se lit pas/);
  });

  it("refuse les notations que `Number` accepterait en silence", () => {
    // `Number("1e3")` vaut 1000 et `Number("0x10")` vaut 16 : personne ne tape
    // ça pour un prix, et les accepter transformerait une faute de frappe en
    // tarif.
    expect(refus("1e3")).toMatch(/ne se lit pas/);
    expect(refus("0x10")).toMatch(/ne se lit pas/);
    expect(refus("Infinity")).toMatch(/ne se lit pas/);
  });

  it("refuse ce qui n'est ni texte ni nombre", () => {
    expect(refus(true)).toBe("Le prix doit être un montant en euros.");
    expect(refus({ cents: 1250 })).toBe("Le prix doit être un montant en euros.");
  });

  it("refuse NaN", () => {
    expect(refus(Number.NaN)).toMatch(/ne se lit pas/);
  });
});

describe("lireMontant — bornes", () => {
  it("refuse un montant négatif par défaut", () => {
    expect(refus("-5")).toBe("Le prix ne peut pas être négatif.");
  });

  it("accepte un négatif si la borne basse l'autorise", () => {
    expect(cents("-5", { min: -1000 })).toBe(-500);
  });

  it("n'écrit jamais « -0,00 € »", () => {
    expect(cents("-0,004", { min: -1000 })).toBe(0);
    expect(Object.is(cents("-0", { min: -1000 }), -0)).toBe(false);
  });

  it("refuse 0 là où un prix est exigé, en le disant", () => {
    expect(refus("0", { min: 1 })).toMatch(/au moins/);
  });

  it("refuse au-delà du plafond", () => {
    expect(refus(String(MONTANT_MAX_CENTS / 100 + 1))).toMatch(/dépasser/);
    expect(cents(String(MONTANT_MAX_CENTS / 100))).toBe(MONTANT_MAX_CENTS);
  });

  it("refuse un nombre de chiffres qui sortirait des entiers exacts", () => {
    expect(refus("1234567890123,45", { max: Number.MAX_SAFE_INTEGER })).toMatch(/ne se lit pas/);
  });
});

describe("lireMontant — arrondi au centime", () => {
  it("arrondit le millième au centime le plus proche", () => {
    expect(cents("12,345")).toBe(1235);
    expect(cents("12,344")).toBe(1234);
    expect(cents("12,999")).toBe(1300);
    expect(cents("0,999")).toBe(100);
  });

  it("ne reproduit pas l'arrondi flottant", () => {
    // `1.005 * 100` vaut 100.49999999999999 en binaire : `Math.round` rend
    // donc 100 (1,00 €) au lieu de 101 (1,01 €). Même chose pour « 8,165 » et
    // « 10,075 ». C'est la raison d'être de ce module — autant ne pas
    // réintroduire l'écart à la frontière de saisie.
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(cents("1,005")).toBe(101);

    expect(Math.round(8.165 * 100)).toBe(816);
    expect(cents("8,165")).toBe(817);

    expect(Math.round(10.075 * 100)).toBe(1007);
    expect(cents("10,075")).toBe(1008);
  });

  it("lit sans erreur un flottant déjà imprécis", () => {
    expect(cents(0.1 + 0.2)).toBe(30);
  });
});

describe("toCents — compatibilité des écrans existants", () => {
  it("garde son contrat sur une saisie valide", () => {
    expect(toCents("11,97")).toBe(1197);
    expect(toCents("11.97")).toBe(1197);
    expect(toCents(11.97)).toBe(1197);
    expect(toCents(-3.5)).toBe(-350);
  });

  it("rend null sur un champ vide ou illisible", () => {
    expect(toCents("")).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents("abc")).toBeNull();
  });

  it("rend null — et non 0 — sur un champ qui ne contient que des espaces", () => {
    // Seul changement de comportement : `Number("")` valant zéro, une saisie
    // effacée se transformait en montant nul.
    expect(toCents("   ")).toBeNull();
  });
});

describe("toEuros ↔ lireMontant", () => {
  it("fait l'aller-retour sans perte", () => {
    for (const c of [0, 1, 50, 999, 1197, 2500, 123450, MONTANT_MAX_CENTS]) {
      expect(cents(toEuros(c))).toBe(c);
    }
  });

  it("rend une chaîne vide pour un montant absent", () => {
    expect(toEuros(null)).toBe("");
    expect(toEuros(undefined)).toBe("");
    expect(toEuros(0)).toBe("0,00");
  });
});
