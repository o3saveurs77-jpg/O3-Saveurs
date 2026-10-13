/* Saisie d'un montant dans le back-office — les trois écrans qui la rataient.
 *
 * Tous trois construisaient leur corps de requête avec
 * `toCents(Number(saisie) || 0)`, ou un `toCents` local qui rendait 0 sur toute
 * saisie inexploitable. Comme les formulaires sont préremplis par `toEuros`
 * (« 25,00 »), que `Number("25,00")` vaut `NaN` et que `|| 0` le change en 0 :
 *
 *  · rouvrir « −10 % dès 25 € » pour corriger sa date de fin la réenregistrait
 *    « dès le premier euro » ;
 *  · corriger une faute dans le nom d'un plat du jour l'annonçait à 0,00 € sur
 *    l'accueil et en haut de la Carte ;
 *  · effacer le prix d'une formule pour le retaper la mettait en vente à
 *    0,00 €.
 *
 * Les fonctions testées ici sont celles qui lisent le formulaire. Le serveur
 * reste l'autorité — elles existent pour qu'aucune saisie illisible ne soit
 * *convertie* en montant, et pour que le refus se lise à l'écran.
 */

import { describe, it, expect } from "vitest";
import {
  lirePromotion,
  lirePourcentage,
  lireUtilisations,
  lireInstant,
  type Form,
} from "@/components/admin/PromotionsAdmin";
import { lirePlatDuJour, type FormulairePlatDuJour } from "@/components/admin/MiseEnAvantAdmin";
import { lireFormule, type Draft } from "@/components/admin/FormulesAdmin";

// ─── Promotions ───────────────────────────────────────────────

const promo = (patch: Partial<Form> = {}): Form => ({
  label: "Bienvenue -10 %",
  kind: "percent",
  valeur: "10",
  code: "BIENVENUE",
  minSubtotal: "25,00",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  weekday: "",
  oncePerCustomer: false,
  auto: false,
  active: true,
  ...patch,
});

const corpsPromo = (patch: Partial<Form> = {}) => {
  const lu = lirePromotion(promo(patch));
  if (!lu.ok) throw new Error(`refus inattendu : ${lu.error}`);
  return lu.corps;
};

const refusPromo = (patch: Partial<Form> = {}) => {
  const lu = lirePromotion(promo(patch));
  return lu.ok ? null : lu.error;
};

describe("lirePromotion — le minimum de commande", () => {
  it("conserve le minimum d'une promotion qu'on rouvre pour autre chose", () => {
    // Le cas exact du défaut : on ne touche qu'à la date de fin.
    expect(corpsPromo({ endsAt: "2026-12-31T23:59" }).minSubtotalCents).toBe(2500);
  });

  it("lit la virgule comme le point", () => {
    expect(corpsPromo({ minSubtotal: "25,50" }).minSubtotalCents).toBe(2550);
    expect(corpsPromo({ minSubtotal: "25.50" }).minSubtotalCents).toBe(2550);
  });

  it("accepte 0 explicitement saisi — « dès le premier euro » est légitime", () => {
    expect(corpsPromo({ minSubtotal: "0" }).minSubtotalCents).toBe(0);
  });

  it("refuse un champ vidé au lieu de le lire comme 0", () => {
    expect(refusPromo({ minSubtotal: "" })).toBe("Le minimum de commande est requis.");
    expect(refusPromo({ minSubtotal: "   " })).toBe("Le minimum de commande est requis.");
  });

  it("refuse une saisie absurde", () => {
    expect(refusPromo({ minSubtotal: "beaucoup" })).toMatch(/ne se lit pas/);
    expect(refusPromo({ minSubtotal: "-5" })).toMatch(/négatif/);
  });
});

describe("lirePromotion — la remise", () => {
  it("lit un pourcentage entier", () => {
    expect(corpsPromo({ kind: "percent", valeur: "15" }).value).toBe(15);
  });

  it("lit une remise en montant fixe, virgule comprise", () => {
    expect(corpsPromo({ kind: "amount", valeur: "5,00", minSubtotal: "25,00" }).value).toBe(500);
  });

  it("rend la promotion en montant fixe éditable de nouveau", () => {
    // Avant : la remise tombait à 0, le serveur refusait (minimum 1 centime),
    // et la promotion ne pouvait plus être enregistrée du tout.
    expect(refusPromo({ kind: "amount", valeur: "5,00", minSubtotal: "25,00" })).toBeNull();
  });

  it("refuse une remise fixe supérieure au minimum, comme le serveur", () => {
    expect(refusPromo({ kind: "amount", valeur: "30,00", minSubtotal: "25,00" })).toMatch(
      /minimum de commande d'au moins/,
    );
  });

  it("refuse une remise fixe à 0 et une remise vide", () => {
    expect(refusPromo({ kind: "amount", valeur: "0" })).toMatch(/au moins/);
    expect(refusPromo({ kind: "amount", valeur: "" })).toBe(
      "Le montant de la remise est requis.",
    );
  });

  it("ignore la valeur pour une livraison offerte", () => {
    expect(corpsPromo({ kind: "free_delivery", valeur: "n'importe quoi" }).value).toBe(0);
  });
});

describe("lirePromotion — cohérence générale", () => {
  it("exige un libellé d'au moins 3 caractères", () => {
    expect(refusPromo({ label: "ab" })).toMatch(/libellé/);
  });

  it("refuse une promotion sans code et non automatique", () => {
    expect(refusPromo({ code: "", auto: false })).toMatch(/doit être automatique/);
  });

  it("refuse un code sur une promotion automatique", () => {
    expect(refusPromo({ code: "BIENVENUE", auto: true })).toMatch(/ne peut pas exiger/);
  });

  it("met le code en majuscules et rend null quand il est vide", () => {
    expect(corpsPromo({ code: " bienvenue " }).code).toBe("BIENVENUE");
    expect(corpsPromo({ code: "", auto: true }).code).toBeNull();
  });

  it("refuse une fin antérieure au début", () => {
    expect(refusPromo({ startsAt: "2026-12-01T10:00", endsAt: "2026-11-01T10:00" })).toMatch(
      /postérieure/,
    );
  });
});

describe("lirePourcentage", () => {
  it("lit un entier de 1 à 100", () => {
    expect(lirePourcentage("10")).toEqual({ ok: true, pourcent: 10 });
    expect(lirePourcentage("100")).toEqual({ ok: true, pourcent: 100 });
    expect(lirePourcentage(" 10 % ")).toEqual({ ok: true, pourcent: 10 });
  });

  it("refuse un champ vide plutôt que de rendre 0 %", () => {
    expect(lirePourcentage("").ok).toBe(false);
  });

  it("refuse hors bornes et non entier", () => {
    expect(lirePourcentage("0").ok).toBe(false);
    expect(lirePourcentage("150").ok).toBe(false);
    expect(lirePourcentage("10,5").ok).toBe(false);
    expect(lirePourcentage("dix").ok).toBe(false);
  });
});

describe("lireUtilisations", () => {
  it("rend null pour un champ vide — promotion illimitée", () => {
    expect(lireUtilisations("")).toEqual({ ok: true, maxUses: null });
    expect(lireUtilisations("  ")).toEqual({ ok: true, maxUses: null });
  });

  it("lit un entier", () => {
    expect(lireUtilisations("50")).toEqual({ ok: true, maxUses: 50 });
  });

  it("refuse ce qui n'est pas un entier, au lieu d'envoyer NaN", () => {
    // `Number("abc")` partait en NaN, que `JSON.stringify` écrit `null` : la
    // promotion devenait silencieusement illimitée.
    expect(lireUtilisations("abc").ok).toBe(false);
    expect(lireUtilisations("0").ok).toBe(false);
    expect(lireUtilisations("-3").ok).toBe(false);
  });
});

describe("lireInstant", () => {
  it("rend null pour un champ vide", () => {
    expect(lireInstant("", "Le début")).toEqual({ ok: true, iso: null });
  });

  it("refuse une date invalide au lieu de lever", () => {
    // `new Date("pas une date").toISOString()` lève, et l'enregistrement
    // s'arrêtait sans message à l'écran.
    expect(lireInstant("pas une date", "Le début")).toEqual({
      ok: false,
      error: "Le début n'est pas une date valide.",
    });
  });
});

// ─── Plats du jour ────────────────────────────────────────────

const special = (patch: Partial<FormulairePlatDuJour> = {}): FormulairePlatDuJour => ({
  id: "s1",
  name: "Couscous royal",
  prix: "14,50",
  date: "2026-10-20",
  weekday: "",
  active: true,
  ...patch,
});

const refusSpecial = (patch: Partial<FormulairePlatDuJour> = {}) => {
  const lu = lirePlatDuJour(special(patch));
  return lu.ok ? null : lu.error;
};

describe("lirePlatDuJour", () => {
  it("conserve le prix quand on corrige seulement le nom", () => {
    // Le cas exact du défaut : une faute dans le nom annonçait 0,00 €.
    const lu = lirePlatDuJour(special({ name: "Couscous Royal" }));
    expect(lu.ok && lu.corps.priceCents).toBe(1450);
  });

  it("lit la virgule comme le point", () => {
    const virgule = lirePlatDuJour(special({ prix: "14,50" }));
    const point = lirePlatDuJour(special({ prix: "14.50" }));
    expect(virgule.ok && virgule.corps.priceCents).toBe(1450);
    expect(point.ok && point.corps.priceCents).toBe(1450);
  });

  it("accepte un prix absent — le site reprend celui du plat rattaché", () => {
    const vide = lirePlatDuJour(special({ prix: "" }));
    expect(vide.ok && vide.corps.priceCents).toBeNull();
    const espaces = lirePlatDuJour(special({ prix: "   " }));
    expect(espaces.ok && espaces.corps.priceCents).toBeNull();
  });

  it("refuse un prix de 0 en expliquant quoi faire à la place", () => {
    expect(refusSpecial({ prix: "0" })).toMatch(/laissez le champ vide/);
    expect(refusSpecial({ prix: "0,00" })).toMatch(/laissez le champ vide/);
  });

  it("refuse une saisie absurde", () => {
    expect(refusSpecial({ prix: "offert" })).toMatch(/ne se lit pas/);
    expect(refusSpecial({ prix: "-2" })).toMatch(/ne se lit pas|négatif|au moins/);
  });

  it("reprend les règles de récurrence du validateur serveur", () => {
    expect(refusSpecial({ date: "2026-10-20", weekday: "3" })).toMatch(/pas les deux/);
    expect(refusSpecial({ date: "", weekday: "" })).toMatch(/date précise/);
    expect(refusSpecial({ name: "x" })).toMatch(/au moins 2 caractères/);
  });

  it("transmet une récurrence hebdomadaire sous forme de nombre", () => {
    const lu = lirePlatDuJour(special({ date: "", weekday: "3" }));
    expect(lu.ok && lu.corps).toMatchObject({ weekday: 3, date: null });
  });
});

// ─── Formules ─────────────────────────────────────────────────

const formule = (patch: Partial<Draft> = {}): Draft => ({
  id: "f1",
  code: "F1",
  name: "Formule Gourmande",
  desc: "Entrée + plat",
  extra: "",
  prix: "15,90",
  active: true,
  slots: [
    {
      id: "sl1",
      label: "Votre plat",
      required: true,
      choices: [
        { dishId: "mafe", supplement: "0,00" },
        { dishId: "tcheb", supplement: "4,00" },
      ],
    },
  ],
  ...patch,
});

const nom = (id: string) =>
  ({ mafe: "Mafé Bœuf", tcheb: "Thiéboudiène" })[id] ?? id;

const refusFormule = (patch: Partial<Draft> = {}) => {
  const lu = lireFormule(formule(patch), nom);
  return lu.ok ? null : lu.error;
};

describe("lireFormule — le prix", () => {
  it("lit le prix et les suppléments en centimes", () => {
    const lu = lireFormule(formule(), nom);
    expect(lu.ok && lu.corps.priceCents).toBe(1590);
    expect(lu.ok && lu.corps.slots[0].choices).toEqual([
      { dishId: "mafe", supplementCents: 0 },
      { dishId: "tcheb", supplementCents: 400 },
    ]);
  });

  it("refuse une formule en vente à 0,00 €", () => {
    // Avant : le `toCents` local rendait 0 sur un champ vide, et l'API accepte
    // un prix à partir de 0 — la formule partait en vente gratuitement.
    expect(refusFormule({ prix: "0", active: true })).toMatch(/commandable gratuitement/);
    expect(refusFormule({ prix: "0,00", active: true })).toMatch(/commandable gratuitement/);
  });

  it("tolère 0 sur une formule masquée, le temps d'en arbitrer le tarif", () => {
    const lu = lireFormule(formule({ prix: "0", active: false }), nom);
    expect(lu.ok && lu.corps.priceCents).toBe(0);
  });

  it("refuse un prix vidé plutôt que de le lire comme 0", () => {
    expect(refusFormule({ prix: "" })).toBe("Le prix de la formule est requis.");
    expect(refusFormule({ prix: "  " })).toBe("Le prix de la formule est requis.");
  });

  it("refuse une saisie absurde ou négative", () => {
    expect(refusFormule({ prix: "quinze euros" })).toMatch(/ne se lit pas/);
    expect(refusFormule({ prix: "-1" })).toMatch(/négatif/);
  });
});

describe("lireFormule — les suppléments", () => {
  it("accepte un supplément nul : la plupart des plats n'en ont pas", () => {
    const lu = lireFormule(
      formule({
        slots: [
          {
            id: "sl1",
            label: "Votre plat",
            required: true,
            choices: [{ dishId: "mafe", supplement: "0" }],
          },
        ],
      }),
      nom,
    );
    expect(lu.ok && lu.corps.slots[0].choices[0].supplementCents).toBe(0);
  });

  it("refuse un supplément vidé, en nommant le plat concerné", () => {
    const erreur = refusFormule({
      slots: [
        {
          id: "sl1",
          label: "Votre plat",
          required: true,
          choices: [{ dishId: "tcheb", supplement: "" }],
        },
      ],
    });
    expect(erreur).toBe("Le supplément de « Thiéboudiène » est requis.");
  });

  it("refuse un supplément illisible", () => {
    expect(
      refusFormule({
        slots: [
          {
            id: "sl1",
            label: "Votre plat",
            required: true,
            choices: [{ dishId: "mafe", supplement: "gratos" }],
          },
        ],
      }),
    ).toMatch(/Mafé Bœuf/);
  });

  it("conserve l'identifiant des créneaux existants, et l'omet pour un nouveau", () => {
    // Un panier en cours de composition référence ces identifiants : les
    // réécrire invaliderait le panier des clients en train de commander.
    const lu = lireFormule(
      formule({
        slots: [
          { id: "sl1", label: "Votre plat", required: true, choices: [] },
          { id: null, label: "Votre dessert", required: false, choices: [] },
        ],
      }),
      nom,
    );
    expect(lu.ok && lu.corps.slots[0].id).toBe("sl1");
    expect(lu.ok && "id" in lu.corps.slots[1]).toBe(false);
  });
});

describe("lireFormule — en-tête", () => {
  it("met le code en majuscules", () => {
    const lu = lireFormule(formule({ code: " f2 " }), nom);
    expect(lu.ok && lu.corps.code).toBe("F2");
  });

  it("refuse un code ou un nom hors bornes, comme le serveur", () => {
    expect(refusFormule({ code: "" })).toMatch(/code/);
    expect(refusFormule({ code: "TROPLONGUE" })).toMatch(/code/);
    expect(refusFormule({ name: "x" })).toMatch(/nom/);
  });

  it("exige un libellé sur chaque créneau", () => {
    expect(refusFormule({ slots: [{ id: null, label: "   ", required: true, choices: [] }] })).toMatch(
      /libellé/,
    );
  });
});
