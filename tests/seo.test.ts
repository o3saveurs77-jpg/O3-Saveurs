import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  toE164,
  openingHoursSpecification,
  priceRange,
  restaurantNode,
  menuNode,
  formulasNode,
  cateringNode,
  aboutPageNode,
  breadcrumbNode,
  faqNode,
  graph,
  abs,
  SITE_URL,
  PUBLIC_ROUTES,
  DISALLOWED_PATHS,
  PAGE_META,
  pageMetadata,
  brandAliases,
  type BusinessProfile,
  type PagePath,
} from "@/lib/seo";
import { DEFAULT_HOURS } from "@/lib/hours";
import type { Category, Dish, Formula, Zone } from "@/lib/menu";

// ─── Fabriques ─────────────────────────────────────────

function dish(over: Partial<Dish> = {}): Dish {
  return {
    id: "d1",
    cat: "africaine",
    name: "Mafé Bœuf",
    desc: "Bœuf mijoté, sauce arachide",
    priceCents: 1200,
    badge: null,
    photo: null,
    options: [],
    tags: [],
    spice: 0,
    popular: false,
    available: true,
    allergens: [],
    stock: null,
    stockAlert: null,
    costCents: null,
    position: 0,
    leadTimeHours: 0,
    vatRateBp: 1000,
    ...over,
  };
}

const PROFILE: BusinessProfile = {
  name: "Ô 3 Saveurs",
  tagline: "Chez Laila",
  phone: "01 72 84 52 44",
  email: "contact@o3saveurs.fr",
  street: "38 rue des Prés Saint-Martin",
  zip: "77340",
  city: "Pontault-Combault",
  lat: null,
  lng: null,
  socials: [],
};

const ZONES: Zone[] = [
  {
    idx: 0,
    minimumCents: 1500,
    feeCents: 250,
    villes: ["Pontault-Combault", "Roissy-en-Brie"],
    zips: ["77340", "77680"],
  },
  { idx: 1, minimumCents: 2500, feeCents: 450, villes: ["Torcy"], zips: ["77200"] },
];

const CATS: Category[] = [
  { id: "africaine", label: "Saveur d'Afrique de l'Ouest", script: "Afrique" },
  { id: "desserts", label: "Desserts", script: "Desserts" },
];

// ─── Téléphone ─────────────────────────────────────────

describe("toE164", () => {
  it("convertit un numéro français en format international", () => {
    expect(toE164("01 72 84 52 44")).toBe("+33172845244");
  });

  it("laisse intact un numéro déjà international", () => {
    expect(toE164("+33172845244")).toBe("+33172845244");
  });

  it("ne casse pas sur une saisie inattendue", () => {
    expect(toE164("")).toBe("");
    expect(toE164("06.12.34.56.78")).toBe("+33612345678");
  });
});

// ─── Graphies de la marque ─────────────────────────────

describe("brandAliases", () => {
  const aliases = brandAliases(PROFILE);

  it("rattache la graphie tapée par les clients à celle du site", () => {
    // « o3 saveurs » est la requête réelle ; « Ô 3 Saveurs » est ce qu'écrit
    // le site. Sans ce pont, rien ne dit à un moteur que c'est le même
    // restaurant.
    expect(aliases).toContain("O3 Saveurs");
    expect(aliases).toContain("O3Saveurs");
    expect(aliases).toContain("Ô3 Saveurs");
    expect(aliases).toContain("O 3 Saveurs");
  });

  it("garde le nom du site, l'enseigne et le domaine", () => {
    expect(aliases).toContain("Ô 3 Saveurs");
    expect(aliases).toContain("Chez Laila");
    expect(aliases).toContain("O3 Saveurs Chez Laila");
    expect(aliases).toContain("o3saveurs.fr");
  });

  it("n'expose jamais un hôte de développement", () => {
    // « localhost:3000 » est une graphie de rien du tout : le garde-fou de
    // `publicHost()` n'accepte qu'un nom de domaine, point et sans port.
    expect(aliases.some((a) => a.includes(":"))).toBe(false);
  });

  it("ne répète aucune graphie", () => {
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("suit le nom des réglages plutôt qu'une liste écrite en dur", () => {
    const autre = brandAliases({ ...PROFILE, name: "Café 7 Épices", tagline: "" });
    expect(autre).toContain("Cafe7 Epices");
    expect(autre).not.toContain("Chez Laila");
  });
});

// ─── Horaires ──────────────────────────────────────────

describe("openingHoursSpecification", () => {
  it("émet une entrée par service, midi et soir séparés", () => {
    const lundi = DEFAULT_HOURS.filter((d) => d.weekday === 1);
    const spec = openingHoursSpecification(lundi);
    expect(spec).toHaveLength(2);
    expect(spec[0]).toMatchObject({ dayOfWeek: "https://schema.org/Monday", opens: "11:30", closes: "14:30" });
    expect(spec[1]).toMatchObject({ dayOfWeek: "https://schema.org/Monday", opens: "18:00", closes: "22:45" });
  });

  it("n'annonce pas le midi les jours fermés le midi", () => {
    // Vendredi (5) et dimanche (0) : service du soir seulement.
    for (const weekday of [0, 5]) {
      const spec = openingHoursSpecification(DEFAULT_HOURS.filter((d) => d.weekday === weekday));
      expect(spec).toHaveLength(1);
      expect(spec[0].opens).toBe("18:00");
    }
  });

  it("n'émet rien pour un jour fermé", () => {
    const spec = openingHoursSpecification([
      { weekday: 2, closed: true, lunchOpen: null, lunchClose: null, dinnerOpen: null, dinnerClose: null },
    ]);
    expect(spec).toEqual([]);
  });

  it("couvre les sept jours de la semaine de référence", () => {
    const spec = openingHoursSpecification(DEFAULT_HOURS);
    // 5 jours à deux services + 2 jours à un seul = 12
    expect(spec).toHaveLength(12);
  });
});

// ─── Fourchette de prix ────────────────────────────────

describe("priceRange", () => {
  it("calcule la fourchette réelle du catalogue", () => {
    const range = priceRange([
      dish({ priceCents: 850 }),
      dish({ priceCents: 1590 }),
      dish({ priceCents: 1200 }),
    ]);
    expect(range).toBe("8–16 €");
  });

  it("ignore les plats sans prix", () => {
    expect(priceRange([dish({ priceCents: null }), dish({ priceCents: 900 })])).toBe("9 €");
  });

  it("retombe sur une valeur générique quand le catalogue est vide", () => {
    expect(priceRange([])).toBe("€€");
  });

  it("écarte accompagnements et boissons — ils ne font pas un repas", () => {
    // Le piment frais à 0,50 € faisait annoncer « 0–18 € » en production.
    const range = priceRange([
      dish({ cat: "accompagnements", name: "Piment frais", priceCents: 50 }),
      dish({ cat: "canettes", name: "Coca 33 cl", priceCents: 200 }),
      dish({ cat: "africaine", priceCents: 900 }),
      dish({ cat: "grillades", priceCents: 1800 }),
    ]);
    expect(range).toBe("9–18 €");
  });

  it("écarte les pièces qui se réservent à l'avance", () => {
    // En production, l'agneau entier à 420 € faisait annoncer « 2–420 € » :
    // une pièce de réception commandée 72 h à l'avance n'est pas le prix d'un
    // repas. Le délai de préparation la distingue, pas sa catégorie.
    const range = priceRange([
      dish({ cat: "sur-commande", name: "Agneau entier", priceCents: 42000, leadTimeHours: 72 }),
      dish({ cat: "sur-commande", name: "Paella", priceCents: 7500, leadTimeHours: 48 }),
      dish({ cat: "africaine", priceCents: 900 }),
      dish({ cat: "grillades", priceCents: 1800 }),
    ]);
    expect(range).toBe("9–18 €");
  });

  it("garde un plat ordinaire, même dans une catégorie à délai", () => {
    // Le filtre porte sur le délai de la pièce, pas sur le nom de sa famille.
    expect(priceRange([dish({ cat: "sur-commande", priceCents: 1400, leadTimeHours: 0 })])).toBe(
      "14 €",
    );
  });

  it("n'annonce jamais un plancher à 0 €", () => {
    expect(priceRange([dish({ cat: "entrees", priceCents: 50 })])).toBe("1 €");
  });
});

// ─── Nœud Restaurant ───────────────────────────────────

describe("restaurantNode", () => {
  const node = restaurantNode({
    profile: PROFILE,
    hours: DEFAULT_HOURS,
    zones: ZONES,
    dishes: [dish({ priceCents: 900 }), dish({ priceCents: 1600 })],
    acceptsCash: true,
    acceptsCard: true,
  });

  it("décrit un Restaurant, pas un LocalBusiness générique", () => {
    expect(node["@type"]).toBe("Restaurant");
  });

  it("porte une adresse postale complète et un téléphone normalisé", () => {
    expect(node.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "38 rue des Prés Saint-Martin",
      postalCode: "77340",
      addressLocality: "Pontault-Combault",
      addressCountry: "FR",
    });
    expect(node.telephone).toBe("+33172845244");
  });

  it("liste les communes livrées sans doublon", () => {
    const served = node.areaServed as { name: string }[];
    expect(served.map((c) => c.name)).toEqual(["Pontault-Combault", "Roissy-en-Brie", "Torcy"]);
  });

  it("omet les coordonnées géographiques tant que le géocodage n'a pas tourné", () => {
    expect(node.geo).toBeUndefined();
  });

  it("porte les coordonnées dès que le géocodage a rendu un point", () => {
    // Un moteur qui classe sur la proximité a besoin du point, pas seulement
    // de la rue. Elles viennent de la Base Adresse Nationale, sans clé Google.
    const situe = restaurantNode({
      profile: { ...PROFILE, lat: 48.796343, lng: 2.609933 },
      hours: DEFAULT_HOURS,
      zones: ZONES,
      dishes: [dish({ priceCents: 900 })],
      acceptsCash: true,
      acceptsCard: true,
    });
    expect(situe.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 48.796343,
      longitude: 2.609933,
    });
  });

  it("ajoute les coordonnées une fois le géocodage fait", () => {
    const geocoded = restaurantNode({
      profile: { ...PROFILE, lat: 48.7969, lng: 2.6103 },
      hours: DEFAULT_HOURS,
      zones: ZONES,
      dishes: [],
      acceptsCash: true,
      acceptsCard: true,
    });
    expect(geocoded.geo).toMatchObject({ latitude: 48.7969, longitude: 2.6103 });
  });

  it("n'annonce pas de moyen de paiement désactivé au back-office", () => {
    const sansEspeces = restaurantNode({
      profile: PROFILE,
      hours: DEFAULT_HOURS,
      zones: ZONES,
      dishes: [],
      acceptsCash: false,
      acceptsCard: true,
    });
    expect(String(sansEspeces.paymentAccepted)).not.toContain("Espèces");
    expect(String(sansEspeces.paymentAccepted)).toContain("Carte bancaire");
  });

  it("n'annonce pas de réservation de table — le restaurant n'en prend pas", () => {
    expect(node.acceptsReservations).toBe(false);
  });
});

// ─── Nœud AboutPage ────────────────────────────────────

describe("aboutPageNode", () => {
  const node = aboutPageNode(PROFILE);

  it("déclare une page qui parle du restaurant, et non qui le côtoie", () => {
    expect(node["@type"]).toBe("AboutPage");
    // `about` rattache l'entité, `mainEntity` dit quoi citer : les deux visent
    // le nœud `Restaurant`, qui doit figurer dans le même graphe de page.
    expect(node.about).toEqual({ "@id": `${SITE_URL}/#restaurant` });
    expect(node.mainEntity).toEqual({ "@id": `${SITE_URL}/#restaurant` });
    expect(node.isPartOf).toEqual({ "@id": `${SITE_URL}/#website` });
  });

  it("reprend la description de la page plutôt qu'un texte parallèle", () => {
    expect(node.description).toBe(PAGE_META["/a-propos"].description);
  });

  it("nomme l'enseigne, puisque c'est ce que la page raconte", () => {
    expect(String(node.name)).toContain("Chez Laila");
    // Enseigne vide : pas de tiret orphelin dans le nom.
    const sansEnseigne = aboutPageNode({ ...PROFILE, tagline: "" });
    expect(String(sansEnseigne.name)).toBe("À propos — Ô 3 Saveurs");
  });
});

// ─── Nœud Menu ─────────────────────────────────────────

describe("menuNode", () => {
  const dishes = [
    dish({ id: "a", cat: "africaine", name: "Mafé Bœuf", priceCents: 1200 }),
    dish({ id: "b", cat: "africaine", name: "Yassa Poulet", priceCents: 1100 }),
    dish({ id: "c", cat: "desserts", name: "Thiakry", priceCents: 400 }),
  ];

  it("range les plats par section, dans l'ordre des catégories", () => {
    const node = menuNode(dishes, CATS);
    const sections = node.hasMenuSection as { name: string; hasMenuItem: unknown[] }[];
    expect(sections.map((s) => s.name)).toEqual(["Saveur d'Afrique de l'Ouest", "Desserts"]);
    expect(sections[0].hasMenuItem).toHaveLength(2);
  });

  it("écarte les plats indisponibles et ceux sans prix", () => {
    const node = menuNode(
      [
        dish({ id: "a", name: "Servi", priceCents: 1200 }),
        dish({ id: "b", name: "Rupture", available: false }),
        dish({ id: "c", name: "Bientôt", priceCents: null }),
      ],
      CATS,
    );
    const items = (node.hasMenuSection as { hasMenuItem: { name: string }[] }[])[0].hasMenuItem;
    expect(items.map((i) => i.name)).toEqual(["Servi"]);
  });

  it("formate le prix en décimal, jamais en centimes", () => {
    const node = menuNode([dish({ priceCents: 1250 })], CATS);
    const item = (node.hasMenuSection as { hasMenuItem: { offers: { price: string } }[] }[])[0]
      .hasMenuItem[0];
    expect(item.offers.price).toBe("12.50");
  });

  it("ne produit pas de section vide", () => {
    const node = menuNode([dish({ cat: "africaine", priceCents: 900 })], CATS);
    expect(node.hasMenuSection).toHaveLength(1);
  });

  it("traduit les régimes reconnus par schema.org, et eux seuls", () => {
    const node = menuNode([dish({ tags: ["Végétarien", "Fait maison"] })], CATS);
    const item = (node.hasMenuSection as { hasMenuItem: Record<string, unknown>[] }[])[0]
      .hasMenuItem[0];
    expect(item.suitableForDiet).toEqual(["https://schema.org/VegetarianDiet"]);
  });

  it("rend les photos en URL absolue", () => {
    const node = menuNode([dish({ photo: "/photos/p04.jpg" })], CATS);
    const item = (node.hasMenuSection as { hasMenuItem: Record<string, unknown>[] }[])[0]
      .hasMenuItem[0];
    expect(item.image).toBe(`${SITE_URL}/photos/p04.jpg`);
  });
});

// ─── Formules ──────────────────────────────────────────

describe("formulasNode", () => {
  const formula: Formula = {
    id: "f1",
    code: "F2",
    name: "Formule Midi",
    desc: "Un plat + une boisson",
    extra: "",
    priceCents: 1090,
    active: true,
    position: 0,
    slots: [],
  } as unknown as Formula;

  it("expose chaque formule comme une offre à prix fixe", () => {
    const node = formulasNode([formula]);
    const first = (node.itemListElement as { position: number; item: Record<string, never> }[])[0];
    expect(first.position).toBe(1);
    expect(first.item).toMatchObject({
      "@type": "MenuItem",
      name: "Formule Midi",
    });
    expect((first.item as unknown as { offers: { price: string } }).offers.price).toBe("10.90");
  });
});

// ─── Fil d'Ariane ──────────────────────────────────────

describe("breadcrumbNode", () => {
  it("numérote les étapes à partir de 1 et rend des URL absolues", () => {
    const node = breadcrumbNode([
      { name: "Accueil", path: "/" },
      { name: "La Carte", path: "/carte" },
    ]);
    expect(node.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "La Carte", item: `${SITE_URL}/carte` },
    ]);
  });
});

// ─── FAQ ───────────────────────────────────────────────

describe("faqNode", () => {
  const node = faqNode({
    profile: PROFILE,
    zones: ZONES,
    hours: DEFAULT_HOURS,
    leadTimeMinutes: 35,
    acceptsCash: true,
    acceptsCard: true,
    hoursLabels: [{ day: "Lundi", hours: "11:30 – 14:30" }],
  });

  it("construit ses réponses depuis les données réelles", () => {
    const answers = (
      node!.mainEntity as { name: string; acceptedAnswer: { text: string } }[]
    ).map((q) => q.acceptedAnswer.text);
    const livraison = answers.find((a) => a.includes("Torcy"));
    expect(livraison).toBeDefined();
    // Le minimum de la zone 2 doit apparaître tel qu'il est en base.
    expect(livraison).toContain("25,00 €");
  });

  it("reprend le téléphone et le délai annoncés ailleurs sur le site", () => {
    const texte = JSON.stringify(node);
    expect(texte).toContain("01 72 84 52 44");
    expect(texte).toContain("35 minutes");
  });

  it("n'invente pas de moyen de paiement", () => {
    const sansCarte = faqNode({
      profile: PROFILE,
      zones: ZONES,
      hours: DEFAULT_HOURS,
      leadTimeMinutes: 35,
      acceptsCash: true,
      acceptsCard: false,
      hoursLabels: [],
    });
    const texte = JSON.stringify(sansCarte);
    expect(texte).not.toContain("carte bancaire en ligne");
  });
});

// ─── Graphe & URL ──────────────────────────────────────

describe("graph", () => {
  it("assemble un document schema.org valide et écarte les nœuds absents", () => {
    const parsed = JSON.parse(graph([{ "@type": "WebSite" }, null]));
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toHaveLength(1);
  });
});

describe("abs", () => {
  it("préfixe le domaine, avec ou sans barre oblique initiale", () => {
    expect(abs("/carte")).toBe(`${SITE_URL}/carte`);
    expect(abs("carte")).toBe(`${SITE_URL}/carte`);
  });

  it("ne laisse jamais de double barre oblique", () => {
    expect(abs("/carte")).not.toContain("//carte");
  });
});

// ─── Cohérence des tables de routes ────────────────────

describe("tables de routes", () => {
  it("n'inscrit au plan du site aucune page interdite aux robots", () => {
    for (const route of PUBLIC_ROUTES) {
      for (const banned of DISALLOWED_PATHS) {
        expect(route.path.startsWith(banned)).toBe(false);
      }
    }
  });

  it("garde le tunnel de commande hors du plan du site (il est en noindex)", () => {
    expect(PUBLIC_ROUTES.map((r) => r.path)).not.toContain("/commander");
  });

  it("déclare l'accueil et la carte en tête", () => {
    expect(PUBLIC_ROUTES[0].path).toBe("/");
    expect(PUBLIC_ROUTES[1].path).toBe("/carte");
  });

  it("interdit l'exploration des pages porteuses de données personnelles", () => {
    for (const p of ["/admin", "/compte", "/facture", "/commande", "/api"]) {
      expect(DISALLOWED_PATHS as readonly string[]).toContain(p);
    }
  });

  it("date chaque entrée du plan du site", () => {
    /* Sans `lastmod`, un robot n'a aucune raison de repasser. La base ne sait
     * dater que les plats, les formules et les pages à sections : les autres
     * tombent sur cette date, qui doit donc exister et être lisible. */
    for (const route of PUBLIC_ROUTES) {
      expect(route.revised, route.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(route.revised).getTime()), route.path).toBe(false);
    }
  });

  it("n'annonce aucune révision à venir", () => {
    // Une date future est un signal que Search Console rejette, et elle trahit
    // presque toujours un horodatage de compilation glissé dans la table.
    const demain = Date.now() + 24 * 3600 * 1000;
    for (const route of PUBLIC_ROUTES) {
      expect(new Date(route.revised).getTime(), route.path).toBeLessThan(demain);
    }
  });
});

// ─── Métadonnées des pages publiques ───────────────────

describe("PAGE_META", () => {
  const entrees = Object.entries(PAGE_META) as [PagePath, (typeof PAGE_META)[PagePath]][];

  /* Les pages vitrine se gagnent sur une requête locale : la commune doit
   * figurer dans la phrase que Google affiche. Les pages légales non — on ne
   * cherche pas « CGV Pontault-Combault », et y pousser la ville ferait du
   * remplissage là où il faut de la clarté. */
  const VITRINE = ["/carte", "/formules", "/traiteur", "/a-propos", "/contact", "/allergenes"];

  it("couvre toutes les pages publiques sauf l'accueil", () => {
    // L'accueil tient sa description du layout racine, qui sert aussi de repli
    // à toute page n'en déclarant pas : la dupliquer ici serait une seconde
    // source pour une même phrase.
    const attendues = PUBLIC_ROUTES.map((r) => r.path).filter((p) => p !== "/");
    expect(Object.keys(PAGE_META).sort()).toEqual([...attendues].sort());
  });

  it("tient chaque description entre 150 et 160 caractères", () => {
    /* Au-delà de 160, Google coupe la phrase en plein milieu ; en deçà de 150,
     * on laisse de la place gratuite inutilisée. Cinq pages sortaient à 163 et
     * plus, deux pages légales à moins de 100. */
    for (const [path, meta] of entrees) {
      expect(meta.description.length, `${path} : « ${meta.description} »`).toBeGreaterThanOrEqual(
        150,
      );
      expect(meta.description.length, `${path} : « ${meta.description} »`).toBeLessThanOrEqual(160);
    }
  });

  it("ne répète pas deux fois la même description", () => {
    // Deux pages à la description identique, c'est Google qui en choisit une
    // et ignore l'autre.
    const textes = entrees.map(([, m]) => m.description);
    expect(new Set(textes).size).toBe(textes.length);
  });

  it("nomme la commune sur les pages vitrine", () => {
    for (const path of VITRINE) {
      expect(PAGE_META[path as PagePath].description, path).toContain("Pontault-Combault");
    }
  });

  it("déclare une image de partage qui existe réellement", () => {
    /* C'est tout l'intérêt du test : un chemin faux ne lève aucune erreur, ne
     * casse aucune page, et se voit seulement sous la forme d'un aperçu gris
     * dans la conversation WhatsApp où le lien a été envoyé. */
    for (const [path, meta] of entrees) {
      expect(meta.share.url, path).toMatch(/^\/photos\/.+\.(jpg|jpeg|png|webp)$/);
      const fichier = join(process.cwd(), "public", meta.share.url);
      expect(existsSync(fichier), `${path} → ${meta.share.url} introuvable`).toBe(true);
    }
  });

  it("déclare des images assez grandes pour une vignette de partage", () => {
    // En dessous de 600 px de large, Facebook et WhatsApp rétrogradent
    // l'aperçu en petite miniature carrée — autant n'en pas mettre.
    for (const [path, meta] of entrees) {
      expect(meta.share.width, path).toBeGreaterThanOrEqual(600);
      expect(meta.share.height, path).toBeGreaterThan(0);
      expect(meta.share.alt.length, path).toBeGreaterThan(20);
    }
  });
});

describe("pageMetadata", () => {
  const meta = pageMetadata({
    path: "/traiteur",
    title: "Traiteur à Pontault-Combault",
    accroche: "Buffets, plateaux repas et réceptions — devis gratuit sous 24 h.",
  });

  it("déclare la canonique de la page, jamais celle de l'accueil", () => {
    // Le piège du dépôt : le layout racine ne porte aucun `alternates`, sans
    // quoi toute page sans canonique propre se déclarerait copie de l'accueil.
    expect(meta.alternates?.canonical).toBe("/traiteur");
  });

  it("porte l'image de la page, que Next n'hérite pas du layout", () => {
    /* Next *remplace* `openGraph`, il ne le complète pas : une page qui en
     * déclarait un perdait l'image du layout et sortait sans visuel. */
    const images = meta.openGraph?.images as { url: string; alt: string }[];
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe(PAGE_META["/traiteur"].share.url);
    expect(meta.twitter?.images).toEqual([PAGE_META["/traiteur"].share.url]);
  });

  it("rétablit ce que le remplacement d'openGraph faisait perdre", () => {
    expect(meta.openGraph).toMatchObject({
      type: "website",
      locale: "fr_FR",
      siteName: "Ô 3 Saveurs — Chez Laila",
      url: "/traiteur",
    });
  });

  it("garde un titre court pour le gabarit du layout, long pour le partage", () => {
    expect(meta.title).toBe("Traiteur à Pontault-Combault");
    expect(meta.openGraph?.title).toBe("Traiteur à Pontault-Combault · Ô 3 Saveurs — Chez Laila");
  });

  it("retombe sur la description quand aucune accroche n'est donnée", () => {
    const sansAccroche = pageMetadata({ path: "/cgv", title: "Conditions générales de vente" });
    expect(sansAccroche.openGraph?.description).toBe(PAGE_META["/cgv"].description);
  });
});
