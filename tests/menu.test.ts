import { describe, it, expect } from "vitest";
import { cats, fmtPrice, formatPhone, info, items, telHref, zones } from "@/lib/menu";

/**
 * `Intl.NumberFormat` insère une espace insécable étroite (U+202F) avant le
 * symbole €, et le caractère exact dépend de la version d'ICU embarquée. On
 * normalise donc les espaces : le test vérifie le format, pas la version de Node.
 */
const nbsp = (s: string) => s.replace(/[  \s]/g, " ");

describe("fmtPrice", () => {
  /**
   * `fmtPrice` prend désormais des **centimes** : c'est l'unité qui circule
   * partout dans le code, précisément pour ne plus manipuler de flottants.
   */
  it("formate des centimes en euros, au format français", () => {
    expect(nbsp(fmtPrice(1200))).toBe("12,00 €");
    expect(nbsp(fmtPrice(350))).toBe("3,50 €");
    expect(nbsp(fmtPrice(299))).toBe("2,99 €");
    expect(nbsp(fmtPrice(0))).toBe("0,00 €");
  });

  it("utilise la virgule comme séparateur décimal", () => {
    expect(fmtPrice(1197)).toContain("11,97");
  });

  it("affiche un tiret pour un prix non défini", () => {
    expect(fmtPrice(null)).toBe("—");
  });
});

describe("catalogue de seed (items)", () => {
  it("contient des plats avec des identifiants uniques", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items.length).toBeGreaterThan(40);
  });

  it("chaque plat a une catégorie connue", () => {
    const catIds = new Set(cats.map((c) => c.id));
    for (const it of items) {
      expect(catIds.has(it.cat)).toBe(true);
    }
  });

  /** Les données de seed sont en euros : c'est `prisma/seed.ts` qui convertit. */
  it("les prix sont soit null (à définir) soit positifs", () => {
    for (const it of items) {
      if (it.price !== null) expect(it.price).toBeGreaterThan(0);
    }
  });

  it("les plats marqués Bientôt n'ont pas de prix", () => {
    for (const it of items) {
      if (it.badge === "Bientôt") expect(it.price).toBeNull();
    }
  });
});

describe("zones de seed", () => {
  it("ont un minimum supérieur ou égal aux frais, et des communes", () => {
    for (const z of zones) {
      expect(z.fee).toBeGreaterThan(0);
      expect(z.min).toBeGreaterThanOrEqual(z.fee);
      expect(z.villes.length).toBeGreaterThan(0);
    }
  });

  /**
   * Les codes postaux sont la clé de rapprochement côté serveur : une zone sans
   * code postal ne serait jamais atteinte, et la commande serait refusée.
   */
  it("déclarent au moins un code postal à 5 chiffres", () => {
    for (const z of zones) {
      expect(z.zips?.length ?? 0).toBeGreaterThan(0);
      for (const zip of z.zips ?? []) {
        expect(zip).toMatch(/^\d{5}$/);
      }
    }
  });
});

/**
 * Coordonnées de repli et mise en forme du téléphone.
 *
 * Le pied de page, les pages d'erreur, le tunnel de commande et le balisage
 * lisaient `info` au lieu des réglages : le restaurant a changé de ligne et
 * tout le site a continué d'afficher l'ancien numéro, sans que rien ne le
 * signale. Les réglages sont désormais la source et `info` le repli — mais un
 * repli faux reste un numéro faux, d'où le numéro nommé ici : le jour où la
 * ligne change, ce test rappelle qu'il y a une constante à suivre.
 */
describe("coordonnées de repli", () => {
  it("portent la ligne téléphonique en service", () => {
    expect(info.phone).toBe("09 54 83 12 75");
  });

  it("portent l'adresse complète, avec code postal et commune", () => {
    expect(info.address).toBe("38 rue des Prés Saint-Martin, 77340 Pontault-Combault");
  });
});

describe("formatPhone", () => {
  /* Le réglage est saisi à la main au back-office : il arrive collé, ponctué ou
     en indicatif international. L'affichage ne doit pas en dépendre. */
  it("met en forme un numéro quelle que soit sa saisie", () => {
    expect(formatPhone("0954831275")).toBe("09 54 83 12 75");
    expect(formatPhone("09 54 83 12 75")).toBe("09 54 83 12 75");
    expect(formatPhone("09.54.83.12.75")).toBe("09 54 83 12 75");
    expect(formatPhone(" +33 9 54 83 12 75 ")).toBe("09 54 83 12 75");
    expect(formatPhone("0033954831275")).toBe("09 54 83 12 75");
  });

  /* Mieux vaut un format inhabituel qu'un numéro mutilé : une valeur qu'on ne
     reconnaît pas ressort telle quelle. */
  it("laisse intacte une valeur non reconnue", () => {
    expect(formatPhone("poste 42")).toBe("poste 42");
    expect(formatPhone("")).toBe("");
  });
});

describe("telHref", () => {
  /* Un lien d'appel sans indicatif ne joint personne depuis un téléphone réglé
     sur un autre pays — et la cible cassait dès que le réglage contenait un
     point ou un tiret. */
  it("compose une cible E.164", () => {
    expect(telHref("0954831275")).toBe("tel:+33954831275");
    expect(telHref("09 54 83 12 75")).toBe("tel:+33954831275");
    expect(telHref("09.54.83.12.75")).toBe("tel:+33954831275");
    expect(telHref("+33 9 54 83 12 75")).toBe("tel:+33954831275");
    expect(telHref("0033954831275")).toBe("tel:+33954831275");
  });

  it("ne garde que les chiffres d'une valeur inattendue", () => {
    expect(telHref("poste 42")).toBe("tel:42");
  });
});
