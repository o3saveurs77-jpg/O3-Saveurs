/* Ô 3 Saveurs — Chez Laila · types du catalogue et données de seed.
 *
 * Deux choses cohabitent ici :
 *  · les **types applicatifs** (`Dish`, `Zone`, …), dont les montants sont en
 *    centimes et qui décrivent ce que l'API renvoie depuis la base ;
 *  · les **données de seed** (`items`, `zones`, `platsDuJour`, …), écrites en
 *    euros pour rester lisibles, et lues uniquement par `prisma/seed.ts`.
 *
 * L'application ne doit jamais afficher les données de seed : la base est la
 * seule source de vérité.
 */

import { fmtCents } from "@/lib/money";
import type { Allergen } from "@/lib/types";

export const photo = (n: number) => `/photos/p${String(n).padStart(2, "0")}.jpg`;

export type Badge = "Healthy" | "Nouveau" | "Bientôt" | null;

export interface OptionChoice {
  l: string;
  /** supplément en centimes */
  priceCents?: number;
}

export interface DishOption {
  name: string;
  required: boolean;
  choices: OptionChoice[];
}

/**
 * Plat tel que servi par l'API, lu depuis la base.
 * Montants en **centimes** (voir `lib/money.ts`).
 */
export interface Dish {
  id: string;
  cat: string;
  name: string;
  desc: string;
  /** prix de base en centimes ; null = à définir / bientôt */
  priceCents: number | null;
  badge: Badge;
  photo: string | null;
  options: DishOption[];
  /** formules d'upsell : [label, prix en centimes] */
  formules?: [string, number][];
  tags: string[];
  spice: number;
  popular: boolean;
  /** disponibilité manuelle ; un stock à 0 rend le plat indisponible de fait */
  available: boolean;
  /** allergènes déclarés (règlement INCO 1169/2011) */
  allergens: Allergen[];
  /** null = stock illimité */
  stock: number | null;
  stockAlert: number | null;
  costCents: number | null;
  position: number;
}

/** Vrai si le plat peut être commandé maintenant (dispo, prix connu, stock). */
export function isOrderable(d: Dish): boolean {
  if (!d.available || d.priceCents === null) return false;
  return d.stock === null || d.stock > 0;
}

export interface Category {
  id: string;
  label: string;
  script: string;
}

/** Zone de livraison, montants en centimes. */
export interface Zone {
  idx: number;
  minimumCents: number;
  feeCents: number;
  villes: string[];
  zips: string[];
}

/**
 * Formule servie par l'API, lue depuis la base.
 *
 * Une formule n'est pas un plat : c'est un prix fixe et une composition. Le
 * client choisit un plat par créneau, le serveur facture le prix de la formule
 * plus les suppléments des plats retenus (voir `lib/formulas.ts`).
 */
export interface Formula {
  id: string;
  /** pastille courte : F1, F2… */
  code: string;
  name: string;
  desc: string;
  extra: string;
  /** en centimes */
  priceCents: number;
  active: boolean;
  position: number;
  slots: FormulaSlot[];
}

export interface FormulaSlot {
  id: string;
  label: string;
  required: boolean;
  position: number;
  choices: FormulaChoice[];
}

export interface FormulaChoice {
  id: string;
  dishId: string;
  /** supplément en centimes, 0 le plus souvent */
  supplementCents: number;
  position: number;
  /** plat rattaché — présent côté public pour éviter un second aller-retour */
  dish?: Dish;
}

// ─── Données de seed (en euros, lisibles) ──────────────────────
// Ces structures ne sont lues que par `prisma/seed.ts`, qui convertit les
// montants en centimes. L'application, elle, ne lit que la base.

export interface SeedDish {
  id: string;
  cat: string;
  name: string;
  desc: string;
  /** prix en euros ; null = à définir */
  price: number | null;
  badge: Badge;
  photo: string | null;
  options: SeedDishOption[];
  formules?: [string, number][];
  tags: string[];
  spice: number;
  popular: boolean;
  available: boolean;
  allergens?: Allergen[];
}

export interface SeedDishOption {
  name: string;
  required: boolean;
  choices: { l: string; price?: number }[];
}

export interface SeedZone {
  min: number;
  fee: number;
  villes: string[];
  zips?: string[];
}

export interface PlatDuJour {
  jour: string;
  nom: string;
}

export const info = {
  name: "Ô 3 Saveurs",
  tag: "Chez Laila",
  sub: "Cuisine du monde",
  baseline: "Afrique · Maghreb · Méditerranée — préparé maison, livré chez vous.",
  phone: "01 72 84 52 44",
  address: "38 rue des Prés Saint-Martin, 77340 Pontault-Combault",
  hours: [
    { d: "Lun – Jeu", h: "11h30 – 14h30  ·  18h00 – 22h45" },
    { d: "Vendredi", h: "18h00 – 22h45  ·  (fermé le midi)" },
    { d: "Samedi", h: "11h30 – 14h30  ·  18h00 – 22h45" },
    { d: "Dimanche", h: "18h00 – 22h45  ·  (fermé le midi)" },
  ],
  payments: ["Espèces", "Carte Bleue", "Tickets Restaurant"],
  partner: "Uber Eats",
  /* Le pied de page dessinait deux ronds cliquables pour Instagram et Snapchat
   * — mais `socials` ne contenait que des libellés, sans la moindre adresse.
   * C'étaient des `<span>` : un visiteur cliquait dans le vide.
   *
   * `href: null` tant que les comptes ne sont pas connus. Le pied de page
   * n'affiche que les entrées renseignées, donc rien pour l'instant : mieux
   * vaut aucune icône qu'une icône morte. Renseigner l'URL suffit à la faire
   * apparaître, il n'y a pas d'autre changement à faire. */
  socials: [
    { name: "Instagram", icon: "insta", href: null },
    { name: "Snapchat", icon: "snap", href: null },
  ] as { name: string; icon: "insta" | "snap"; href: string | null }[],
  /* Ces six visuels alimentent le collage du hero et la grille « à propos ».
   * La sélection précédente — p03, p10, p25, p32, p19, p23 — était six cadrages
   * de la *même* table dressée, dont deux paires de fichiers rigoureusement
   * identiques (p03=p05, p10=p23). Le collage donnait donc trois fois la même
   * image et la grille du bas quatre fois, ce qui faisait paraître le catalogue
   * photo bien plus pauvre qu'il ne l'est.
   *
   * Ordre voulu : la vue d'ensemble ouvre (grande carte du hero), puis un plat
   * par famille. Les quatre premiers servent aussi la grille « à propos », d'où
   * l'alternance des familles dès le début. */
  heroSpreads: [
    photo(3), // table dressée — abondance
    photo(11), // tajine veau & pruneaux — Maghreb
    photo(4), // tcheb poulet — Afrique de l'Ouest
    photo(12), // brochettes bœuf — grillades
    photo(30), // yassa poulet
    photo(20), // cocktail maison — la couleur d'une boisson
  ],
};

// Zones de livraison à paliers, centrées sur Pontault-Combault — minimum de
// commande et frais croissent avec la distance (voir la maquette de
// référence). Remplace l'ancien tarif unique à 15 €/4 €.
export const zones: SeedZone[] = [
  { min: 15, fee: 2.5, villes: ["Pontault-Combault", "Roissy-en-Brie", "Ozoir-la-Ferrière"], zips: ["77340", "77680", "77330"] },
  { min: 20, fee: 3.5, villes: ["Émerainville", "Croissy-Beaubourg", "Pontcarré", "Lognes"], zips: ["77184", "77183", "77135", "77185"] },
  { min: 25, fee: 4.5, villes: ["Noisiel", "Torcy", "Champs-sur-Marne", "Brou-sur-Chantereine"], zips: ["77186", "77200", "77420", "77177"] },
  { min: 35, fee: 5.5, villes: ["Bussy-Saint-Georges", "Noisy-le-Grand", "Chelles", "Lagny-sur-Marne"], zips: ["77600", "93160", "77500", "77400"] },
];

export const cats: Category[] = [
  { id: "entrees", label: "Entrées", script: "Entrées" },
  { id: "salades", label: "Salades & Bowls", script: "Salades & Bowls" },
  { id: "maghreb", label: "Saveur du Maghreb", script: "Saveur du Maghreb" },
  { id: "medit", label: "Saveur Méditerranéenne", script: "Saveur Méditerranéenne" },
  { id: "africaine", label: "Saveur d'Afrique de l'Ouest", script: "Saveur d'Afrique de l'Ouest" },
  { id: "grillades", label: "Grillades", script: "Grillades" },
  { id: "sandwichs", label: "Sandwichs", script: "Sandwichs" },
  { id: "accompagnements", label: "Accompagnements", script: "Accompagnements" },
  { id: "boissons", label: "Boissons", script: "Boissons" },
  { id: "desserts", label: "Desserts", script: "Desserts" },
];

/* Sauces proposées avec les sandwichs. La liste précédente — « Sauce Niamey »,
 * « Piment maison », « Sriracha » — ne correspondait à rien de vendu : la carte
 * officielle ne connaît que les deux sauces maison, reprises telles quelles ci-
 * dessous. Un client se voyait donc imposer un choix entre trois sauces dont
 * aucune n'existait au comptoir. */
export const sauces = ["Sauce Ô3 Verte", "Sauce Ô3 Piquante", "Sans sauce"];
const rizOpt: SeedDishOption = { name: "Riz", required: true, choices: [{ l: "Riz blanc" }, { l: "Riz rouge" }] };

// helper de création
let _id = 0;
type DishInput = Partial<SeedDish> & Pick<SeedDish, "cat" | "name" | "desc"> & { price: number | null };
const D = (o: DishInput): SeedDish => ({
  id: "d" + ++_id,
  badge: null,
  photo: null,
  options: [],
  tags: [],
  spice: 0,
  popular: false,
  available: true,
  ...o,
});

/*
 * Transcription de la carte officielle remise par la cliente le 2026-08-06
 * (`O3-Saveurs Carte-mise-a-jour.pdf`, 53 plats numérotés) — c'est elle qui
 * fait foi, et non les maquettes HTML antérieures.
 *
 * Deux corrections par rapport à la transcription du 2026-08-05, qui s'appuyait
 * sur ces maquettes :
 *  · les plats sénégalais s'appellent **Tcheb**, pas « Thiéboudiène ». Le
 *    renommage précédent contredisait la carte imprimée, et surtout il
 *    désaccordait la clé de `FORMULA_SUPPLEMENTS` du nom réel du plat : le
 *    supplément de 4 € du Tcheb Poisson n'était plus jamais appliqué, et la
 *    formule partait à perte ;
 *  · « Saveur Méditerranéenne » ne figure pas parmi les familles ouvertes au
 *    créneau « plat » des formules (voir `PLAT_CATS`).
 *
 * Les plats de l'ancienne carte absents du PDF (Yassa Bœuf, Mafé Poulet,
 * Athiéké Poisson, Bowl Quinoa, Banh Mì, Loc Lac Bœuf, Bo Bun, Nouilles
 * Sautées, Degué, Panna Cotta) ne sont pas repris ici — voir
 * `RECONCILIATION-CARTE.md` pour leur sort en base.
 */
export const items: SeedDish[] = [
  // ENTRÉES
  D({ cat: "entrees", name: "Pastels Thon", desc: "Feuilletés croustillants au thon relevé — dorés et craquants.", price: 6, tags: ["6 pièces", "Croustillant"], photo: null }),
  D({ cat: "entrees", name: "Pastels Viande hachée", desc: "Bœuf haché épicé en pâte dorée et croustillante.", price: 7, tags: ["6 pièces", "Épicé"], photo: null }),
  D({ cat: "entrees", name: "Pastels Poulet", desc: "Effiloché de poulet aux épices douces, pâte dorée.", price: 7, tags: ["6 pièces", "Fait maison"], photo: null }),
  D({ cat: "entrees", name: "Salade composée", desc: "Salade fraîche, tomates cerises, vinaigrette huile d'olive.", price: 4, photo: photo(21), tags: ["Végé", "Frais"] }),
  D({ cat: "entrees", name: "Patates fourrées au fromage", desc: "Pommes de terre garnies au fromage fondant, panées maison.", price: 4, tags: ["6 pièces", "Fromage"], photo: null }),

  // SALADES & BOWLS
  D({ cat: "salades", name: "Salade Saumon Avocat", desc: "Saumon et avocat, mesclun et crudités, vinaigrette à l'huile d'olive.", price: 9, photo: photo(34), popular: true, tags: ["Frais", "Petit pain"] }),
  D({ cat: "salades", name: "Salade Pâtes & Poulet", desc: "Pâtes fraîches, poulet grillé et tomates cerises.", price: 8.4, photo: photo(37), tags: ["Tomates cerises"] }),
  D({ cat: "salades", name: "Salade Poulet Mozzarella", desc: "Poulet, mozzarella, tomates cerises et jeunes pousses.", price: 8.4, photo: photo(38), tags: ["Tomates cerises"] }),
  D({ cat: "salades", name: "Salade César Avocat", desc: "Poulet grillé, avocat, parmesan, œuf et croûtons.", price: 9, photo: photo(39), popular: true }),
  D({ cat: "salades", name: "Cecina de Bœuf", desc: "Cecina (bœuf séché), copeaux de parmesan, avocat et glaçage balsamique.", price: 10, photo: photo(41), tags: ["Généreux", "Petit pain"] }),

  // SAVEUR DU MAGHREB (tajines)
  D({ cat: "maghreb", name: "Tajine Veau & Pruneaux", desc: "Veau fondant, pruneaux moelleux, amandes, œuf et sésame — un sucré-salé signature.", price: 10.5, photo: photo(11), popular: true, tags: ["Sucré-salé"] }),
  D({ cat: "maghreb", name: "Tajine Poulet aux Légumes", desc: "Poulet mijoté, petits pois, pommes de terre, carottes et olives.", price: 9, photo: photo(16), tags: ["Mijoté", "Généreux"] }),
  D({ cat: "maghreb", name: "Tajine Boulettes de Bœuf", desc: "Boulettes de bœuf mijotées dans une sauce tomate parfumée — un grand classique.", price: 9.5, photo: photo(14), tags: ["Mijoté", "Sauce tomate"] }),

  // SAVEUR MÉDITERRANÉENNE
  D({
    cat: "medit",
    name: "Chakchouka",
    desc: "Tomates, poivrons, oignons & épices — mijoté parfumé.",
    price: 5,
    photo: null,
    tags: ["Mijoté", "Épicé"],
    /* Le supplément œuf poché est imprimé sur la carte. Sans cette option il
       était encaissé de la main à la main, hors commande en ligne. */
    options: [
      { name: "Œuf poché", required: false, choices: [{ l: "Sans" }, { l: "Avec un œuf poché", price: 1 }] },
    ],
  }),
  D({ cat: "medit", name: "Salade d'Aubergines (Zaalouk)", desc: "Caviar d'aubergines à la marocaine, tomate, ail & cumin.", price: 5, photo: null, tags: ["Végé", "Marocaine"] }),
  D({ cat: "medit", name: "Sardines Frites", desc: "Sardines fraîches, sel & citron — juste saisies, croustillantes.", price: 8, photo: null, tags: ["Poisson frais", "Citronné"] }),

  // SAVEUR D'AFRIQUE DE L'OUEST
  D({ cat: "africaine", name: "Tcheb Poulet", desc: "Riz au gras façon thiéboudiène, poulet mijoté et légumes confits.", price: 8.5, photo: photo(4), options: [rizOpt], popular: true, tags: ["Mijoté"] }),
  D({ cat: "africaine", name: "Tcheb Bœuf", desc: "Riz au gras tomaté, bœuf fondant mijoté et légumes confits.", price: 9.5, photo: photo(24), options: [rizOpt], popular: true, tags: ["Mijoté"] }),
  D({ cat: "africaine", name: "Tcheb Poisson", desc: "Riz au gras, poisson frit, légumes fondants et sauce maison.", price: 13, photo: photo(28), options: [rizOpt], popular: true, tags: ["Poisson frais"] }),
  D({ cat: "africaine", name: "Yassa Poulet", desc: "Poulet braisé, sauce oignon-citron, olives et riz blanc parfumé.", price: 8.5, photo: photo(30), popular: true, tags: ["Citronné"] }),
  D({ cat: "africaine", name: "Mafé Bœuf", desc: "Bœuf mijoté dans une sauce arachide onctueuse, servi sur riz blanc parfumé.", price: 9.5, photo: photo(1), popular: true, tags: ["Sauce arachide"] }),

  // GRILLADES
  D({ cat: "grillades", name: "Brochette Poulet", desc: "Brochettes de poulet mariné, grillées au feu de bois — accompagnement au choix.", price: 7, photo: photo(0), tags: ["Feu à la braise", "Mariné"] }),
  D({ cat: "grillades", name: "Brochette Bœuf", desc: "Brochettes de bœuf mariné, grillées au feu de bois — accompagnement au choix.", price: 8, photo: photo(12), tags: ["Feu à la braise", "Mariné"] }),
  D({ cat: "grillades", name: "Poulet Rôti", desc: "Poulet rôti maison au feu de bois, doré et juteux — 1 accompagnement au choix.", price: 8, photo: photo(17), tags: ["Feu à la braise", "Rôti maison"] }),
  D({ cat: "grillades", name: "Cuisse de Poulet", desc: "Cuisse de poulet marinée & braisée au feu de bois — à l'unité.", price: 3, photo: null, tags: ["Feu à la braise", "Mariné"] }),
  D({ cat: "grillades", name: "Pilon de Poulet", desc: "Pilons de poulet marinés & braisés au feu de bois — 3 pièces.", price: 5, photo: null, tags: ["Feu à la braise", "Mariné"] }),
  D({ cat: "grillades", name: "Ailes de Poulet", desc: "Ailes de poulet épicées & croustillantes, braisées au feu de bois — 5 pièces.", price: 5, photo: null, tags: ["Feu à la braise", "Épicé"] }),
  D({ cat: "grillades", name: "Poisson Entier Grillé", desc: "Dorade entière grillée au feu de bois, selon arrivage — 1 accompagnement.", price: 18, photo: photo(29), tags: ["Feu à la braise", "Poisson frais"] }),

  // SANDWICHS
  D({ cat: "sandwichs", name: "Sandwich Merguez", desc: "Merguez grillées en baguette tradition, salade et sauce Ô3 au choix.", price: 6.5, photo: null, tags: ["Baguette tradition", "Grillé"] }),
  D({ cat: "sandwichs", name: "Sandwich Brochette Poulet", desc: "Brochette de poulet mariné en baguette tradition, crudités et sauce au choix.", price: 7, photo: null, tags: ["Baguette tradition", "Mariné"] }),
  D({ cat: "sandwichs", name: "Sandwich Kefta", desc: "Kefta de bœuf épicée en baguette tradition, salade et sauce au choix.", price: 7.5, photo: null, tags: ["Baguette tradition", "Épicé"] }),
  D({ cat: "sandwichs", name: "Sandwich Brochette Bœuf", desc: "Brochette de bœuf grillé en baguette tradition, crudités et sauce au choix.", price: 8, photo: null, tags: ["Baguette tradition", "Grillé"] }),

  // ACCOMPAGNEMENTS
  D({ cat: "accompagnements", name: "Riz Blanc", desc: "Riz parfumé nature, cuit maison — l'accompagnement classique.", price: 2.5, photo: photo(18), tags: ["Nature", "Sans gluten"] }),
  D({ cat: "accompagnements", name: "Alloco", desc: "Bananes plantain bien mûres, frites et caramélisées.", price: 4, photo: photo(9), popular: true, tags: ["Caramélisé"] }),
  D({ cat: "accompagnements", name: "Riz Rouge", desc: "Riz au gras tomaté — parfumé, généreux et coloré.", price: 4, photo: photo(15), tags: ["Tomaté", "Fait maison"] }),
  D({ cat: "accompagnements", name: "Tcheb blanc", desc: "Riz au gras blanc, parfumé — façon sénégalaise.", price: 4, photo: photo(18), tags: ["Au gras", "Parfumé"] }),
  D({ cat: "accompagnements", name: "Frites Maison", desc: "Pommes de terre fraîches, coupées et frites maison — dorées et croustillantes.", price: 4, photo: photo(27), tags: ["Croustillant", "Fait maison"] }),
  D({ cat: "accompagnements", name: "Salade Composée", desc: "Salade fraîche, tomates cerises, vinaigrette huile d'olive & balsamique.", price: 4, photo: photo(21), tags: ["Frais", "Végétarien"] }),
  D({ cat: "accompagnements", name: "Patate fourrée au fromage", desc: "Pommes de terre garnies au fromage fondant, panées maison.", price: 4, photo: null, tags: ["6 pièces", "Fromage"] }),
  D({ cat: "accompagnements", name: "Sauce Ô3 Verte", desc: "Sauce aux herbes maison, fraîche et relevée.", price: 1, photo: null, tags: ["Pot", "Maison"] }),
  D({ cat: "accompagnements", name: "Sauce Ô3 Piquante", desc: "La signature maison — ça pique juste ce qu'il faut.", price: 1, photo: null, tags: ["Pot", "Piquant"] }),
  D({ cat: "accompagnements", name: "Piment frais", desc: "Piment frais haché maison.", price: 0.5, photo: null, tags: ["Pot", "Piquant"] }),

  // BOISSONS
  D({ cat: "boissons", name: "Jus de Gingembre", desc: "Gingembre frais pressé maison, vif et tonifiant.", price: 3.5, photo: photo(2), tags: ["Pressé maison", "50 cl"], popular: true }),
  D({ cat: "boissons", name: "Jus de Bissap", desc: "Infusion d'hibiscus pressée maison, fraîche et légèrement acidulée.", price: 3.5, photo: photo(26), tags: ["Infusion maison", "50 cl"] }),
  D({ cat: "boissons", name: "Cocktail Maison", desc: "Cocktail de fruits sans alcool, frais et de saison — selon arrivage.", price: 3.5, photo: photo(20), tags: ["Selon saison", "25 cl"] }),
  D({ cat: "boissons", name: "Jus d'Avocat", desc: "Jus d'avocat onctueux, préparé à la commande.", price: 4, photo: null, tags: ["À la commande", "25 cl"] }),
  D({ cat: "boissons", name: "Jus d'Orange", desc: "Oranges fraîchement pressées, pur jus du jour.", price: 3.5, photo: null, tags: ["Pressé du jour", "25 cl"] }),
  D({ cat: "boissons", name: "Canette 33 cl", desc: "Coca, Sprite, Fanta, Ice Tea, Orangina, Tropico — et eau minérale.", price: 2, photo: null, tags: ["33 cl", "Bien frais"] }),

  // DESSERTS
  D({ cat: "desserts", name: "Ananas frais", desc: "Ananas frais, coupé minute — léger et sucré.", price: 2.5, photo: photo(13), tags: ["Frais"] }),
  D({ cat: "desserts", name: "Tiramisu", desc: "Tiramisu maison, café & mascarpone.", price: 2.5, photo: null, tags: ["Fait maison"] }),
  D({ cat: "desserts", name: "Fondant Chocolat", desc: "Cœur coulant au chocolat noir, servi tiède.", price: 3, photo: null, tags: ["Fait maison"] }),
  D({ cat: "desserts", name: "Mousse au Chocolat", desc: "Mousse au chocolat onctueuse, faite maison.", price: 3, photo: null, tags: ["Fait maison"] }),
  D({ cat: "desserts", name: "Tarte du jour", desc: "Tarte pâtissière du jour — demandez la saveur du moment.", price: 3, photo: null, tags: ["Fait maison"] }),
];

/* Options communes aux sandwichs : la sauce au choix et le supplément cheddar,
 * tous deux imprimés sur la carte (« Suppl. cheddar +1,00 € · frites maison ou
 * salade composée »). Le cheddar manquait, il n'était donc facturable qu'en
 * dehors de la commande en ligne. */
items.forEach((it) => {
  if (it.cat === "sandwichs") {
    it.options = (it.options || []).concat([
      { name: "Sauce", required: true, choices: sauces.map((s) => ({ l: s })) },
      { name: "Cheddar", required: false, choices: [{ l: "Sans" }, { l: "Avec cheddar", price: 1 }] },
    ]);
  }
});

// ─── Formules de départ ────────────────────────────────────────
// Reprises par `prisma/seed.ts`, qui crée les créneaux et y rattache les plats
// des catégories listées. Une fois en base, tout se pilote depuis
// l'administration : prix, libellés, plats acceptés dans chaque créneau.

export interface SeedFormulaSlot {
  label: string;
  /** un créneau facultatif peut être laissé vide par le client */
  required?: boolean;
  /** catégories dont les plats alimentent ce créneau */
  cats: string[];
  /** plats écartés de ce créneau, par nom */
  exclude?: string[];
}

export interface SeedFormula {
  code: string;
  name: string;
  desc: string;
  extra: string;
  /** prix en euros */
  price: number;
  slots: SeedFormulaSlot[];
}

/**
 * Suppléments appliqués dans toutes les formules, par nom de plat (en euros).
 * Ce sont les deux plats dont le coût matière dépasse largement le prix de
 * formule — les servir sans supplément vendrait la formule à perte.
 */
export const FORMULA_SUPPLEMENTS: Record<string, number> = {
  "Tcheb Poisson": 4,
  "Poisson Entier Grillé": 9,
};

/**
 * Familles proposées au créneau « plat » des formules — « salades & bowls,
 * tajines, plats d'Afrique de l'Ouest & grillades » selon la carte officielle.
 * La Méditerranée en est absente : ses trois plats sont des petites assiettes
 * à 5–8 €, hors d'échelle pour un créneau de formule à 10,90 €.
 */
const PLAT_CATS = ["salades", "maghreb", "africaine", "grillades"];

/** Boissons maison : la formule exclut les canettes revendues telles quelles. */
const BOISSON_SLOT: SeedFormulaSlot = {
  label: "Votre boisson",
  cats: ["boissons"],
  exclude: ["Canette 33 cl"],
};

export const seedFormulas: SeedFormula[] = [
  {
    code: "F1",
    name: "Express",
    desc: "Un plat au choix + une boisson",
    extra: "Formule la plus rapide",
    price: 10.9,
    slots: [{ label: "Votre plat", cats: PLAT_CATS }, BOISSON_SLOT],
  },
  {
    code: "F2",
    name: "Midi",
    desc: "Entrée + plat au choix + dessert",
    extra: "Idéal pour la pause déjeuner",
    price: 13.9,
    slots: [
      { label: "Votre entrée", cats: ["entrees"] },
      { label: "Votre plat", cats: PLAT_CATS },
      { label: "Votre dessert", cats: ["desserts"] },
    ],
  },
  {
    code: "F3",
    name: "Gourmande",
    desc: "Entrée + plat + dessert + boisson",
    extra: "La formule complète",
    price: 16.9,
    slots: [
      { label: "Votre entrée", cats: ["entrees"] },
      { label: "Votre plat", cats: PLAT_CATS },
      { label: "Votre dessert", cats: ["desserts"] },
      BOISSON_SLOT,
    ],
  },
  {
    code: "F4",
    name: "Sandwich",
    desc: "Sandwich + frites maison + boisson",
    extra: "Sur le pouce",
    price: 11.9,
    slots: [
      { label: "Votre sandwich", cats: ["sandwichs"] },
      { label: "Votre accompagnement", cats: ["accompagnements"] },
      BOISSON_SLOT,
    ],
  },
  {
    code: "F5",
    name: "Menu Enfant",
    desc: "Petit plat + accompagnement + boisson + dessert",
    extra: "Pensé pour les plus jeunes",
    price: 8.9,
    slots: [
      { label: "Son plat", cats: ["africaine", "maghreb", "grillades", "sandwichs"] },
      { label: "Son accompagnement", cats: ["accompagnements"] },
      { label: "Sa boisson", cats: ["boissons"] },
      { label: "Son dessert", cats: ["desserts"] },
    ],
  },
];

/** Plats du jour de départ, repris par le seed. L'application lit la base. */
export const platsDuJour: PlatDuJour[] = [
  { jour: "Mercredi", nom: "Sardines grillées" },
  { jour: "Jeudi", nom: "Paëlla" },
  { jour: "Vendredi", nom: "Couscous Royal" },
];

/**
 * Formate un montant **en centimes** pour l'affichage : 1197 → « 11,97 € ».
 * Réexporté depuis `lib/money.ts` : les composants gardent leur import
 * habituel, et il n'existe qu'une seule implémentation du formatage.
 */
export const fmtPrice = fmtCents;
