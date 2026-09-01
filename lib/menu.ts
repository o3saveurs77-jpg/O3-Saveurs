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
  /**
   * Délai de préparation en heures. 0 = servi au créneau habituel ; au-delà, le
   * plat est « sur commande » (voir `lib/preorder.ts`).
   */
  leadTimeHours: number;
  /** Taux de TVA en points de base : 1000 = 10 %, 550 = 5,5 % (boissons). */
  vatRateBp: number;
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
  /** délai de préparation en heures ; absent ou 0 = plat servi au créneau du jour */
  leadTimeHours?: number;
  /** taux de TVA en points de base ; absent = 1000 (10 %, restauration) */
  vatRateBp?: number;
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
  /* Pluriel : la maison est sur plusieurs plateformes, et n'en citer qu'une
   * laissait croire aux autres qu'elle n'y est pas. */
  partners: "Uber Eats & Deliveroo",
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
  /* Les canettes et l'eau sont revendues telles quelles : ni la même marge, ni
     le même travail, ni le même inventaire que les jus pressés maison. Les
     réunir sous « Boissons » obligeait à les vendre comme un plat unique
     « Canette 33 cl » — le client ne choisissait pas sa boisson, la cuisine ne
     savait pas laquelle sortir, et le stock d'un Coca était impossible à
     distinguer de celui d'un Tropico. Une famille à part, une référence par
     canette. */
  { id: "canettes", label: "Canettes & bouteilles", script: "Canettes & bouteilles" },
  { id: "desserts", label: "Desserts", script: "Desserts" },
  /* Grosses pièces et plats de fête, préparés sur réservation. Une catégorie
     à part et non un badge dans les grillades : le client qui cherche à dîner
     ce soir ne doit pas tomber sur un agneau entier à 48 h de délai au milieu
     des brochettes. */
  { id: "sur-commande", label: "Sur commande", script: "Sur commande" },
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
 * Transcription de la carte officielle remise par la cliente le 2026-08-12
 * (`O3-Saveurs Carte-FINALE-corrigee.pdf`, 53 plats numérotés) — c'est elle qui
 * fait foi, et non les maquettes HTML antérieures.
 *
 * Elle confirme la transcription du 2026-08-06 sur tous les prix et toutes les
 * familles, et n'en renverse qu'un point :
 *  · les plats sénégalais s'appellent **Thiéboudiène**. La carte du 6 août
 *    disait « Tcheb » ; la carte finale écrit « Thiéboudiène » partout, jusque
 *    dans la mention de supplément au bas de la page des formules.
 *
 *    ⚠️ Ce nom est aussi la clé de `FORMULA_SUPPLEMENTS`, que `prisma/seed.ts`
 *    apparie **par le nom** du plat. Les deux doivent donc être renommés d'un
 *    seul geste, ici : les désaccorder ferait écrire un supplément de 0 € au
 *    prochain seed, et le Thiéboudiène Poisson à 13 € entrerait dans une
 *    formule à 10,90 € sans que rien ne le signale. La panne s'est déjà
 *    produite. À l'exécution, en revanche, le supplément est lu en base
 *    (`FormulaChoice.supplementCents`) : renommer un plat ne l'efface pas.
 *
 *    La base, elle, ne suit pas ce fichier — c'est elle que le site affiche.
 *    Le renommage s'y applique par `npm run db:thieboudiene`.
 *
 * Inchangé : « Saveur Méditerranéenne » ne figure pas parmi les familles
 * ouvertes au créneau « plat » des formules (voir `PLAT_CATS`).
 *
 * Les plats de l'ancienne carte absents du PDF (Yassa Bœuf, Mafé Poulet,
 * Athiéké Poisson, Bowl Quinoa, Banh Mì, Loc Lac Bœuf, Bo Bun, Nouilles
 * Sautées, Degué, Panna Cotta) ne sont pas repris ici — voir
 * `RECONCILIATION-CARTE.md` pour leur sort en base.
 */
export const items: SeedDish[] = [
  // ENTRÉES
  D({ cat: "entrees", name: "Pastels Thon", desc: "Feuilletés croustillants au thon relevé — dorés et craquants.", price: 6, tags: ["6 pièces", "Croustillant"], photo: "/photos/pastel-thon.jpg" }),
  D({ cat: "entrees", name: "Pastels Viande hachée", desc: "Bœuf haché épicé en pâte dorée et croustillante.", price: 7, tags: ["6 pièces", "Épicé"], photo: "/photos/pastel-boeuf.jpg" }),
  D({ cat: "entrees", name: "Pastels Poulet", desc: "Effiloché de poulet aux épices douces, pâte dorée.", price: 7, tags: ["6 pièces", "Fait maison"], photo: "/photos/pastel-poulet.jpg" }),
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
  D({ cat: "africaine", name: "Thiéboudiène Poulet", desc: "Riz au gras façon Thiéboudiène, poulet mijoté et légumes confits.", price: 8.5, photo: photo(4), options: [rizOpt], popular: true, tags: ["Mijoté"] }),
  D({ cat: "africaine", name: "Thiéboudiène Bœuf", desc: "Riz au gras tomaté, bœuf fondant mijoté et légumes confits — la générosité du Thiéboudiène.", price: 9.5, photo: photo(24), options: [rizOpt], popular: true, tags: ["Mijoté"] }),
  D({ cat: "africaine", name: "Thiéboudiène Poisson", desc: "Riz au gras, poisson frit entier, légumes fondants et sauce maison.", price: 13, photo: photo(28), options: [rizOpt], popular: true, tags: ["Poisson frais"] }),
  D({ cat: "africaine", name: "Yassa Poulet", desc: "Poulet braisé, sauce oignon-citron, olives et riz blanc parfumé.", price: 8.5, photo: photo(30), popular: true, tags: ["Citronné"] }),
  D({ cat: "africaine", name: "Mafé Bœuf", desc: "Bœuf mijoté dans une sauce arachide onctueuse, servi sur riz blanc parfumé.", price: 9.5, photo: photo(1), popular: true, tags: ["Sauce arachide"] }),

  // GRILLADES
  D({ cat: "grillades", name: "Brochette Poulet", desc: "Brochettes de poulet mariné, grillées au feu de bois — accompagnement au choix.", price: 7, photo: photo(0), tags: ["Feu à la braise", "Mariné"] }),
  D({ cat: "grillades", name: "Brochette Bœuf", desc: "Brochettes de bœuf mariné, grillées au feu de bois — accompagnement au choix.", price: 8, photo: photo(12), tags: ["Feu à la braise", "Mariné"] }),
  D({ cat: "grillades", name: "Poulet Rôti", desc: "Poulet rôti maison au feu de bois, doré et juteux — 1 accompagnement au choix.", price: 8, photo: photo(17), tags: ["Feu à la braise", "Rôti maison"] }),
  D({ cat: "grillades", name: "Cuisse de Poulet", desc: "Cuisse de poulet marinée & braisée au feu de bois — à l'unité.", price: 3, photo: "/photos/cuisse-poulet-unite.jpg", tags: ["Feu à la braise", "Mariné"] }),
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
  D({ cat: "accompagnements", name: "Thiéboudiène blanc", desc: "Riz au gras blanc, parfumé — façon sénégalaise.", price: 4, photo: "/photos/thieboudiene-blanc.jpg", tags: ["Au gras", "Parfumé"] }),
  D({ cat: "accompagnements", name: "Frites Maison", desc: "Pommes de terre fraîches, coupées et frites maison — dorées et croustillantes.", price: 4, photo: photo(27), tags: ["Croustillant", "Fait maison"] }),
  D({ cat: "accompagnements", name: "Salade Composée", desc: "Salade fraîche, tomates cerises, vinaigrette huile d'olive & balsamique.", price: 4, photo: photo(21), tags: ["Frais", "Végétarien"] }),
  D({ cat: "accompagnements", name: "Patate fourrée au fromage", desc: "Pommes de terre garnies au fromage fondant, panées maison.", price: 4, photo: null, tags: ["6 pièces", "Fromage"] }),
  D({ cat: "accompagnements", name: "Sauce Ô3 Verte", desc: "Sauce aux herbes maison, fraîche et relevée.", price: 1, photo: "/photos/sauce-verte.jpg", tags: ["Pot", "Maison"] }),
  D({ cat: "accompagnements", name: "Sauce Ô3 Piquante", desc: "La signature maison — ça pique juste ce qu'il faut.", price: 1, photo: "/photos/sauce-piquante.jpg", tags: ["Pot", "Piquant"] }),
  D({ cat: "accompagnements", name: "Piment frais", desc: "Piment frais haché maison.", price: 0.5, photo: "/photos/piment-frais.jpg", tags: ["Pot", "Piquant"] }),

  /* BOISSONS — TVA à 5,5 %.
   *
   * Le taux réduit de l'art. 278-0 bis A vaut pour les boissons non alcoolisées
   * vendues en **contenant fermé** : bouteille, canette. C'est le cas ici, la
   * vente se faisant à emporter ou en livraison. Servie au gobelet, la même
   * boisson relèverait de 10 % — le taux se règle alors plat par plat depuis
   * l'écran Plats, sans toucher au code. */
  D({ cat: "boissons", name: "Jus de Gingembre", desc: "Gingembre frais pressé maison, vif et tonifiant.", price: 3.5, photo: photo(2), tags: ["Pressé maison", "50 cl"], popular: true, vatRateBp: 550 }),
  D({ cat: "boissons", name: "Jus de Bissap", desc: "Infusion d'hibiscus pressée maison, fraîche et légèrement acidulée.", price: 3.5, photo: photo(26), tags: ["Infusion maison", "50 cl"], vatRateBp: 550 }),
  D({ cat: "boissons", name: "Cocktail Maison", desc: "Cocktail de fruits sans alcool, frais et de saison — selon arrivage.", price: 3.5, photo: photo(20), tags: ["Selon saison", "25 cl"], vatRateBp: 550 }),
  D({ cat: "boissons", name: "Jus d'Avocat", desc: "Jus d'avocat onctueux, préparé à la commande.", price: 4, photo: null, tags: ["À la commande", "25 cl"], vatRateBp: 550 }),
  D({ cat: "boissons", name: "Jus d'Orange", desc: "Oranges fraîchement pressées, pur jus du jour.", price: 3.5, photo: null, tags: ["Pressé du jour", "25 cl"], vatRateBp: 550 }),

  /* CANETTES & EAUX — une ligne par référence.
   *
   * Il n'y avait qu'un plat, « Canette 33 cl », dont la description énumérait
   * six marques. Trois conséquences, toutes payées au comptoir : le client
   * commandait « une canette » sans dire laquelle ; le bon de préparation
   * n'indiquait pas quoi sortir du frigo ; et le stock était un compteur unique
   * pour six produits — impossible de savoir qu'il ne restait plus de Coca tant
   * qu'il restait du Tropico. Le créneau boisson des formules devait de surcroît
   * écarter ce plat par son nom, faute de pouvoir écarter une famille.
   *
   * Ce sont les six marques de la carte officielle, plus l'eau. La cliente
   * ajoute ou retire une référence depuis l'écran Plats — c'est bien l'intérêt
   * d'en faire des plats.
   *
   * Identifiants explicites : la numérotation `dN` suit le rang dans cette
   * liste, une insertion ici renommerait tout ce qui suit lors d'un seed
   * rejoué. Voir la même précaution sur « sur commande » plus bas. */
  D({ id: "can-coca", cat: "canettes", name: "Coca-Cola 33 cl", desc: "Canette de Coca-Cola, servie bien fraîche.", price: 2, photo: "/photos/coca-cola.jpg", tags: ["33 cl", "Bien frais"], vatRateBp: 550 }),
  D({ id: "can-sprite", cat: "canettes", name: "Sprite 33 cl", desc: "Canette de Sprite, servie bien fraîche.", price: 2, photo: "/photos/sprite.jpg", tags: ["33 cl", "Bien frais"], vatRateBp: 550 }),
  D({ id: "can-fanta", cat: "canettes", name: "Fanta 33 cl", desc: "Canette de Fanta, servie bien fraîche.", price: 2, photo: "/photos/fanta.jpg", tags: ["33 cl", "Bien frais"], vatRateBp: 550 }),
  D({ id: "can-ice-tea", cat: "canettes", name: "Ice Tea 33 cl", desc: "Canette d'Ice Tea, servie bien fraîche.", price: 2, photo: "/photos/ice-tea.jpg", tags: ["33 cl", "Bien frais"], vatRateBp: 550 }),
  D({ id: "can-orangina", cat: "canettes", name: "Orangina 33 cl", desc: "Canette d'Orangina, servie bien fraîche.", price: 2, photo: "/photos/orangina.jpg", tags: ["33 cl", "Bien frais"], vatRateBp: 550 }),
  D({ id: "can-tropico", cat: "canettes", name: "Tropico 33 cl", desc: "Canette de Tropico, servie bien fraîche.", price: 2, photo: "/photos/tropico.jpg", tags: ["33 cl", "Bien frais"], vatRateBp: 550 }),
  D({ id: "can-eau", cat: "canettes", name: "Volvic 50 cl", desc: "Bouteille d'eau minérale naturelle Volvic, 50 cl.", price: 2, photo: "/photos/volvic-50cl.jpg", tags: ["50 cl", "Bien frais"], vatRateBp: 550 }),

  /* GRANDS FORMATS — la bouteille de 1,5 L, pour les tablées.
   *
   * La grille boissons d'août 2026 les ajoute pour une raison de panier : une
   * commande de couscous pour six repartait avec six canettes, quand une
   * bouteille coûte moins cher au client et laisse davantage à la maison.
   *
   * 4,00 € le soda et 2,50 € l'eau, soit 0,50 à 1,00 € sous le marché des
   * plateformes : c'est un produit de supermarché, dont le client connaît le
   * prix — contrairement aux jus maison, où le 50 cl fait la différence.
   *
   * Les marques sont celles des photos fournies par la maison, et non la liste
   * indicative du document, qui citait Oasis et Evian : on ne met pas en vente
   * une référence dont personne n'a confirmé qu'elle est au frigo. */
  D({ id: "btl-coca", cat: "canettes", name: "Coca-Cola 1,5 L", desc: "Bouteille de Coca-Cola, 1,5 L — à partager.", price: 4, photo: "/photos/coca-cola-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),
  D({ id: "btl-sprite", cat: "canettes", name: "Sprite 1,5 L", desc: "Bouteille de Sprite, 1,5 L — à partager.", price: 4, photo: "/photos/sprite-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),
  D({ id: "btl-fanta", cat: "canettes", name: "Fanta 1,5 L", desc: "Bouteille de Fanta Orange, 1,5 L — à partager.", price: 4, photo: "/photos/fanta-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),
  D({ id: "btl-ice-tea", cat: "canettes", name: "Ice Tea 1,5 L", desc: "Bouteille d'Ice Tea pêche, 1,5 L — à partager.", price: 4, photo: "/photos/ice-tea-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),
  D({ id: "btl-orangina", cat: "canettes", name: "Orangina 1,5 L", desc: "Bouteille d'Orangina, 1,5 L — à partager.", price: 4, photo: "/photos/orangina-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),
  D({ id: "btl-tropico", cat: "canettes", name: "Tropico 1,5 L", desc: "Bouteille de Tropico, 1,5 L — à partager.", price: 4, photo: "/photos/tropico-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),
  D({ id: "btl-volvic", cat: "canettes", name: "Volvic 1,5 L", desc: "Bouteille d'eau minérale naturelle Volvic, 1,5 L.", price: 2.5, photo: "/photos/volvic-15l.jpg", tags: ["1,5 L", "À partager"], vatRateBp: 550 }),

  /* DESSERTS — identifiants figés à leur valeur d'origine (d49 à d53).
   *
   * Ils étaient numérotés par leur rang : les sept canettes ajoutées juste
   * au-dessus les auraient décalés de d49-d53 à d55-d59, et un seed rejoué
   * aurait réécrit six plats existants sous le nom du voisin. Un identifiant
   * ne doit pas dépendre de ce qui le précède dans un fichier. */
  D({ id: "d49", cat: "desserts", name: "Ananas frais", desc: "Ananas frais, coupé minute — léger et sucré.", price: 2.5, photo: photo(13), tags: ["Frais"] }),
  D({ id: "d50", cat: "desserts", name: "Tiramisu", desc: "Tiramisu maison, café & mascarpone.", price: 2.5, photo: null, tags: ["Fait maison"] }),
  D({ id: "d51", cat: "desserts", name: "Fondant Chocolat", desc: "Cœur coulant au chocolat noir, servi tiède.", price: 3, photo: null, tags: ["Fait maison"] }),
  D({ id: "d52", cat: "desserts", name: "Mousse au Chocolat", desc: "Mousse au chocolat onctueuse, faite maison.", price: 3, photo: null, tags: ["Fait maison"] }),
  D({ id: "d53", cat: "desserts", name: "Tarte du jour", desc: "Tarte pâtissière du jour — demandez la saveur du moment.", price: 3, photo: null, tags: ["Fait maison"] }),

  /* SUR COMMANDE — grosses pièces et plats de fête.
   *
   * Prix laissés à `null` (« Bientôt » sur la carte) tant que la cliente ne les
   * a pas arrêtés : `unitPriceOf` refuse une ligne sans prix, ces plats ne
   * peuvent donc pas être commandés à zéro euro par accident. Ils se
   * renseignent depuis l'écran Plats, sans toucher au code.
   *
   * Les délais suivent la charge réelle : un gigot ou un couscous se lancent la
   * veille pour le surlendemain (48 h), une bête entière demande un passage
   * chez le boucher et une journée de four de plus (72 h).
   *
   * Identifiants **explicites**, et non le `dN` automatique. La numérotation
   * suit le rang dans cette liste, alors que la base contient deux plats de
   * l'ancienne carte (Panna Cotta, Mousse au Chocolat) qui occupent déjà d54 et
   * d55 sans y figurer — voir `RECONCILIATION-CARTE.md`. Un seed rejoué aurait
   * renommé ces deux desserts en gigot et en épaule, et comme le délai n'est
   * posé qu'à la création, le gigot serait ressorti commandable pour le soir
   * même. Un identifiant qui décrit le plat ne peut pas dériver ainsi. */
  D({ id: "sc-gigot", cat: "sur-commande", name: "Gigot d'agneau", desc: "Gigot d'agneau rôti lentement aux épices, tendre à se défaire à la cuillère.", price: null, photo: null, tags: ["Sur commande", "Pièce entière"], leadTimeHours: 48 }),
  D({ id: "sc-epaule", cat: "sur-commande", name: "Épaule d'agneau", desc: "Épaule d'agneau confite au four, fondante et parfumée.", price: null, photo: null, tags: ["Sur commande", "Pièce entière"], leadTimeHours: 48 }),
  D({ id: "sc-couscous", cat: "sur-commande", name: "Couscous marocain", desc: "Couscous royal aux sept légumes, semoule roulée maison — pour la tablée.", price: null, photo: null, tags: ["Sur commande", "À partager"], leadTimeHours: 48 }),
  D({ id: "sc-paella", cat: "sur-commande", name: "Paella", desc: "Paella généreuse aux fruits de mer et au poulet, safran et poivrons.", price: null, photo: null, tags: ["Sur commande", "À partager"], leadTimeHours: 48 }),
  D({ id: "sc-demi-agneau", cat: "sur-commande", name: "Demi-agneau", desc: "Demi-agneau préparé et rôti entier — pour vos grandes occasions.", price: null, photo: null, tags: ["Sur commande", "Grande réception"], leadTimeHours: 72 }),
  D({ id: "sc-agneau-entier", cat: "sur-commande", name: "Agneau entier", desc: "Agneau entier rôti à la braise, préparé sur mesure pour vos fêtes.", price: null, photo: null, tags: ["Sur commande", "Grande réception"], leadTimeHours: 72 }),

  /* PHOTOS D'AOÛT 2026 — deux plats que la maison cuisine déjà mais que la
   * carte ne portait pas. Ils arrivent par leurs photos, livrées le 31 août :
   * un couscous sans viande, qu'aucune ligne ne proposait alors que les
   * couscous en ligne contiennent tous de la viande, et la pastilla, dont la
   * garniture se choisit — c'est ce que dit la photo fournie.
   *
   * Prix arrêtés avec la cliente : 9,90 € le couscous, 9,00 € la pastilla.
   *
   * Identifiants explicites et place en fin de liste, pour la raison dite juste
   * au-dessus : le `D` incrémente son compteur à chaque appel, identifiant
   * fourni ou non, et une insertion au milieu décalerait tous les `dN`
   * suivants. Leur famille d'affichage vient de `cat`, leur rang de
   * `position` — posé à la création en base par `scripts/nouveaux-plats.ts`. */
  D({ id: "couscous-vegetarien", cat: "maghreb", name: "Couscous Végétarien", desc: "Semoule roulée maison et ses sept légumes mijotés — courgettes, carottes, navets et pois chiches.", price: 9.9, badge: "Nouveau", photo: "/photos/couscous-vegetarien.jpg", tags: ["Végé", "Mijoté"] }),
  D({ id: "pastilla", cat: "entrees", name: "Pastilla", desc: "Feuilleté croustillant aux amandes effilées, sucré-salé — garniture au choix.", price: 8.9, badge: "Nouveau", photo: "/photos/pastilla.jpg", options: [{ name: "Garniture", required: true, choices: [{ l: "Poulet" }, { l: "Fruits de mer", price: 2 }] }], tags: ["Croustillant", "Sucré-salé"] }),
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
  "Thiéboudiène Poisson": 4,
  "Poisson Entier Grillé": 9,
  /* La pastilla est la plus chère des entrées — 9 €, quand les autres vont de
   * 4 à 7,50 €. Sans supplément, un seed la ferait entrer dans le créneau
   * « votre entrée » de la formule Midi à 15,90 €, aux côtés d'un plat à
   * 12,90 € : vendue à perte. Déduit de la règle énoncée plus haut — formule
   * garnie ≈ prix à la carte + 4 € — et à faire confirmer par la cliente. */
  Pastilla: 1.4,
  /* Grands formats : le créneau boisson leur est ouvert depuis le 31 août, et
   * une bouteille de 1,5 L vaut le double d'une canette. Sans ces lignes, un
   * seed la donnerait — 4,00 € de marchandise dans une formule à 12,90 €.
   *
   * Le montant est calé sur la canette à 2,00 €, la boisson incluse de la
   * formule la moins garnie : c'est le supplément le plus prudent, celui
   * qu'aucune formule ne peut sous-facturer. En base, il est recalculé créneau
   * par créneau — +0,50 € seulement là où la boisson incluse est un jus à
   * 3,50 €. */
  "Coca-Cola 1,5 L": 2,
  "Sprite 1,5 L": 2,
  "Fanta 1,5 L": 2,
  "Ice Tea 1,5 L": 2,
  "Orangina 1,5 L": 2,
  "Tropico 1,5 L": 2,
  "Volvic 1,5 L": 0.5,
};

/**
 * Familles proposées au créneau « plat » des formules — « salades & bowls,
 * tajines, plats d'Afrique de l'Ouest & grillades » selon la carte officielle.
 * La Méditerranée en est absente : ses trois plats sont des petites assiettes
 * à 5–8 €, hors d'échelle pour un créneau de formule à 10,90 €.
 */
const PLAT_CATS = ["salades", "maghreb", "africaine", "grillades"];

/**
 * Jus maison, canettes, eaux et grands formats.
 *
 * La famille des canettes avait été écartée de ce créneau lors de l'éclatement
 * du plat fourre-tout. La cliente l'y a rouverte le 31 août, avec les
 * bouteilles de 1,5 L : deux formules sur quatre n'offraient que les jus
 * maison, et un client qui voulait un Coca avec son sandwich devait le
 * commander à part, hors formule.
 *
 * L'exclusion se faisait auparavant en écartant un plat par son nom — une
 * chaîne à retaper à l'identique, qu'un simple renommage depuis
 * l'administration suffisait à rendre inopérante. Le mécanisme a été retiré
 * avec son dernier usage ; une famille, elle, ne dépend pas d'un libellé.
 *
 * ⚠️ Ouvrir une famille entière rend `FORMULA_SUPPLEMENTS` indispensable pour
 * ce qu'elle contient de cher : sans les lignes qui y sont posées, un seed
 * offrirait une bouteille de 1,5 L à 4,00 € dans une formule à 12,90 €. Les
 * montants déclarés là-bas sont les plus prudents — calés sur la canette à
 * 2,00 €, boisson incluse de la formule la moins garnie. En base, le supplément
 * est calculé créneau par créneau (`scripts/formules-boissons.ts`), et c'est la
 * base qui s'affiche.
 */
const BOISSON_SLOT: SeedFormulaSlot = {
  label: "Votre boisson",
  cats: ["boissons", "canettes"],
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
