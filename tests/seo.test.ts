import { describe, expect, it } from "vitest";

import {
  toE164,
  openingHoursSpecification,
  priceRange,
  restaurantNode,
  menuNode,
  formulasNode,
  breadcrumbNode,
  faqNode,
  graph,
  abs,
  SITE_URL,
  PUBLIC_ROUTES,
  DISALLOWED_PATHS,
  brandAliases,
  type BusinessProfile,
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
});
