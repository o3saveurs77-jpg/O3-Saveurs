import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_SECTIONS,
  KIND_META,
  PAGES,
  SECTION_KINDS,
  accents,
  isAllowedHref,
  isAllowedPhoto,
  isPageSlug,
  isSectionKind,
  normalizeContent,
  paragraphs,
  starterContent,
  strongs,
} from "@/lib/pageSections";

/**
 * Le contenu des pages vitrine est désormais saisi au back-office et écrit tel
 * quel dans le HTML public. `normalizeContent` est donc la frontière de
 * confiance : ce qui passe ici finit chez le visiteur.
 */

describe("liens autorisés", () => {
  it("accepte les ancres, les chemins internes, http(s), tel et mailto", () => {
    expect(isAllowedHref("#saveurs")).toBe(true);
    expect(isAllowedHref("/carte")).toBe(true);
    expect(isAllowedHref("/carte?cat=tajines#haut")).toBe(true);
    expect(isAllowedHref("https://ubereats.com/o3")).toBe(true);
    expect(isAllowedHref("tel:0172845244")).toBe(true);
    expect(isAllowedHref("mailto:contact@o3saveurs.fr")).toBe(true);
  });

  it("rejette les schémas exécutables", () => {
    // Un lien administrable est une entrée de script si on ne le filtre pas.
    expect(isAllowedHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedHref("JavaScript:alert(1)")).toBe(false);
    expect(isAllowedHref("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isAllowedHref("vbscript:msgbox(1)")).toBe(false);
  });
});

describe("photos autorisées", () => {
  const HOTE = "cellar-c2.services.clever-cloud.com";
  const initial = process.env.NEXT_PUBLIC_STORAGE_HOST;

  afterEach(() => {
    if (initial === undefined) delete process.env.NEXT_PUBLIC_STORAGE_HOST;
    else process.env.NEXT_PUBLIC_STORAGE_HOST = initial;
  });

  it("accepte les visuels livrés avec le site", () => {
    expect(isAllowedPhoto("/photos/p03.jpg")).toBe(true);
    expect(isAllowedPhoto("/photos/plat.webp")).toBe(true);
  });

  it("accepte une photo déposée sur le stockage configuré", () => {
    process.env.NEXT_PUBLIC_STORAGE_HOST = HOTE;
    expect(isAllowedPhoto(`https://o3-photos.${HOTE}/dishes/abc.jpg`)).toBe(true);
  });

  it("rejette les hôtes que la politique de sécurité bloquerait", () => {
    // `img-src` (next.config.mjs) ne charge pas ces sources : accepter l'URL
    // afficherait un cadre vide chez le visiteur, sans le moindre message.
    process.env.NEXT_PUBLIC_STORAGE_HOST = HOTE;
    expect(isAllowedPhoto("https://exemple.fr/photo.jpg")).toBe(false);
    expect(isAllowedPhoto("javascript:alert(1)")).toBe(false);
    expect(isAllowedPhoto("/photos/../../etc/passwd")).toBe(false);
    // Hôte voisin qui *contient* le nôtre sans en être un sous-domaine.
    expect(isAllowedPhoto(`https://faux-${HOTE}/x.jpg`)).toBe(false);
  });

  it("n'accepte aucune adresse distante tant qu'aucun stockage n'est configuré", () => {
    /* C'est l'état d'un poste de développement : mieux vaut refuser que
     * d'enregistrer une adresse qui n'affichera rien en production. */
    delete process.env.NEXT_PUBLIC_STORAGE_HOST;
    expect(isAllowedPhoto(`https://o3-photos.${HOTE}/dishes/abc.jpg`)).toBe(false);
    expect(isAllowedPhoto("/photos/p03.jpg")).toBe(true);
  });
});

describe("normalizeContent", () => {
  it("complète un objet vide sans lever", () => {
    const c = normalizeContent({});
    expect(c.theme).toBe("clair");
    expect(c.columns).toBe(3);
    expect(c.items).toEqual([]);
    expect(c.photos).toEqual([]);
  });

  it("survit à n'importe quelle valeur — une section corrompue ne casse pas la page", () => {
    expect(() => normalizeContent(null)).not.toThrow();
    expect(() => normalizeContent("nawak")).not.toThrow();
    expect(() => normalizeContent(42)).not.toThrow();
    expect(normalizeContent({ items: "pas un tableau", photos: 7 }).items).toEqual([]);
  });

  it("ramène un thème ou un nombre de colonnes inconnus aux valeurs de la charte", () => {
    expect(normalizeContent({ theme: "fluo" }).theme).toBe("clair");
    expect(normalizeContent({ columns: 17 }).columns).toBe(3);
    expect(normalizeContent({ columns: 4 }).columns).toBe(4);
  });

  it("écarte les liens et les photos non autorisés", () => {
    const c = normalizeContent({
      ctaHref: "javascript:alert(1)",
      altHref: "/carte",
      photos: ["/photos/p03.jpg", "https://pirate.example/x.jpg"],
      items: [{ id: "a", href: "javascript:void(0)", photo: "https://pirate.example/y.png" }],
    });
    expect(c.ctaHref).toBe("");
    expect(c.altHref).toBe("/carte");
    expect(c.photos).toEqual(["/photos/p03.jpg"]);
    expect(c.items[0].href).toBe("");
    expect(c.items[0].photo).toBeNull();
  });

  it("borne les listes — un appel direct à l'API ne peut pas gonfler une page", () => {
    const c = normalizeContent({
      items: Array.from({ length: 60 }, (_, i) => ({ id: `i${i}`, title: `T${i}` })),
      photos: Array.from({ length: 60 }, () => "/photos/p03.jpg"),
    });
    expect(c.items).toHaveLength(12);
    expect(c.photos).toHaveLength(12);
  });

  it("garde les prix en centiers entiers et borne le compteur d'éléments", () => {
    expect(normalizeContent({ items: [{ priceCents: 1090.4 }] }).items[0].priceCents).toBe(1090);
    expect(normalizeContent({ items: [{ priceCents: -5 }] }).items[0].priceCents).toBe(0);
    expect(normalizeContent({ items: [{}] }).items[0].priceCents).toBeNull();
    expect(normalizeContent({ limit: 999 }).limit).toBe(24);
    expect(normalizeContent({ limit: 0 }).limit).toBe(1);
  });

  it("donne une clé à un élément qui n'en a pas — sinon React remonterait la liste", () => {
    const c = normalizeContent({ items: [{ title: "A" }, { title: "B" }] });
    expect(c.items.map((i) => i.id)).toEqual(["i0", "i1"]);
  });
});

describe("catalogue des blocs", () => {
  it("décrit chaque type de section", () => {
    for (const kind of SECTION_KINDS) {
      const meta = KIND_META[kind];
      expect(meta.label, kind).toBeTruthy();
      expect(meta.hint, kind).toBeTruthy();
    }
  });

  it("propose un contenu de départ qui traverse la validation sans perte", () => {
    // Un bloc fraîchement ajouté doit s'afficher tel qu'annoncé : si la
    // validation en retirait un lien ou une photo, la cliente verrait un bloc
    // amputé sans comprendre pourquoi.
    for (const kind of SECTION_KINDS) {
      expect(normalizeContent(starterContent(kind)), kind).toEqual(starterContent(kind));
    }
  });

  it("reconnaît ses pages et ses types, et rejette le reste", () => {
    expect(isPageSlug("accueil")).toBe(true);
    expect(isPageSlug("panier")).toBe(false);
    expect(isSectionKind("cartes")).toBe(true);
    expect(isSectionKind("__proto__")).toBe(false);
  });
});

describe("contenu par défaut des pages", () => {
  it("n'utilise que des types de blocs connus", () => {
    for (const page of PAGES) {
      for (const section of DEFAULT_SECTIONS[page]) {
        expect(isSectionKind(section.kind), `${page}/${section.kind}`).toBe(true);
      }
    }
  });

  it("traverse la validation sans perte", () => {
    // Ce contenu est écrit en base au premier passage dans le back-office :
    // s'il était rogné, le site repartirait amputé de ses liens ou de ses photos.
    for (const page of PAGES) {
      for (const section of DEFAULT_SECTIONS[page]) {
        expect(normalizeContent(section.content), `${page}/${section.kind}`).toEqual(
          section.content,
        );
      }
    }
  });

  it("explique les plats sur commande avant de les lister", () => {
    // Réserver un gigot suppose un délai, l'accord du restaurant et un
    // paiement d'avance : le bloc n'a de sens que s'il porte ces explications,
    // et le rendu compte sur leur icône pour aligner les trois cartes.
    const bloc = DEFAULT_SECTIONS.accueil.find((s) => s.kind === "sur_commande");
    expect(bloc).toBeDefined();
    expect(bloc!.content.items.length).toBeGreaterThanOrEqual(3);
    for (const item of bloc!.content.items) {
      expect(item.title, item.id).toBeTruthy();
      expect(item.text, item.id).toBeTruthy();
      expect(item.icon, item.id).toBeTruthy();
    }
  });

  it("ne place qu'une fois les blocs qui ne valent qu'une fois", () => {
    for (const page of PAGES) {
      const counts = new Map<string, number>();
      for (const s of DEFAULT_SECTIONS[page]) {
        counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
      }
      for (const [kind, n] of counts) {
        if (KIND_META[kind as keyof typeof KIND_META].once) {
          expect(n, `${page}/${kind}`).toBe(1);
        }
      }
    }
  });
});

describe("mise en forme du texte saisi", () => {
  it("découpe les paragraphes sur les lignes vides", () => {
    expect(paragraphs("Un\n\nDeux\n\n\nTrois")).toEqual(["Un", "Deux", "Trois"]);
    expect(paragraphs("   ")).toEqual([]);
  });

  it("repère le passage manuscrit d'un titre", () => {
    expect(accents("Le voyage *des saveurs* livré")).toEqual([
      { text: "Le voyage ", accent: false },
      { text: "des saveurs", accent: true },
      { text: " livré", accent: false },
    ]);
  });

  it("laisse un titre sans étoile intact", () => {
    expect(accents("Nos formules")).toEqual([{ text: "Nos formules", accent: false }]);
    expect(accents("2 * 3")).toEqual([{ text: "2 * 3", accent: false }]);
  });

  it("repère un passage appuyé dans un texte", () => {
    expect(strongs("De l'**Afrique de l'Ouest** au Maghreb")).toEqual([
      { text: "De l'", strong: false },
      { text: "Afrique de l'Ouest", strong: true },
      { text: " au Maghreb", strong: false },
    ]);
  });
});
