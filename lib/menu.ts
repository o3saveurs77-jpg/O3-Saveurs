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

export interface Formule {
  id: string;
  name: string;
  /** en centimes */
  priceCents: number;
  desc: string;
  extra: string;
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
  baseline: "Afrique · Maghreb · Asie — préparé maison, livré chez vous.",
  phone: "01 72 84 52 44",
  address: "6 bis rue du Village, 77185 Lognes",
  hours: [
    { d: "Lun – Jeu", h: "11h30 – 14h30  ·  18h00 – 22h45" },
    { d: "Vendredi", h: "18h00 – 22h45  ·  (fermé le midi)" },
    { d: "Samedi", h: "11h30 – 14h30  ·  18h00 – 22h45" },
    { d: "Dimanche", h: "18h00 – 22h45  ·  (fermé le midi)" },
  ],
  payments: ["Espèces", "Carte Bleue", "Tickets Restaurant"],
  partner: "Uber Eats",
  socials: ["Instagram", "Snapchat"],
  heroSpreads: [photo(3), photo(10), photo(25), photo(32), photo(19), photo(23)],
};

// Zones de livraison (frais fixes indicatifs + minimum de commande)
// Les codes postaux sont la clé de rapprochement fiable : un nom de commune se
// saisit de dix façons, un code postal non. À faire confirmer par la cliente en
// même temps que les frais réels (spec §10).
export const zones: SeedZone[] = [
  { min: 15, fee: 2.5, villes: ["Lognes", "Noisiel", "Croissy-Beaubourg", "Torcy", "Champs-sur-Marne", "Émerainville", "Collégien"], zips: ["77185", "77186", "77183", "77200", "77420", "77184", "77090"] },
  { min: 20, fee: 3.5, villes: ["Bussy-Saint-Georges", "Noisy-le-Grand", "Vaires-sur-Marne", "Ferrières-en-Brie"], zips: ["77600", "93160", "77360", "77164"] },
  { min: 25, fee: 4.5, villes: ["Pontault-Combault", "Lagny-sur-Marne", "Roissy-en-Brie"], zips: ["77340", "77400", "77680"] },
  { min: 35, fee: 5.5, villes: ["Chessy", "Bailly-Romainvilliers", "Serris", "Montévrain", "Magny-le-Hongre"], zips: ["77700", "77144"] },
];

export const cats: Category[] = [
  { id: "entrees", label: "Entrées", script: "Entrées" },
  { id: "salades", label: "Salades & Bowls", script: "Salades & Bowls" },
  { id: "maghreb", label: "Saveur du Maghreb", script: "Saveur du Maghreb" },
  { id: "asiatique", label: "Saveur d'Asie", script: "Saveur d'Asie" },
  { id: "africaine", label: "Saveur Africaine", script: "Saveur Africaine" },
  { id: "grillades", label: "Grillades", script: "Grillades" },
  { id: "sandwichs", label: "Sandwichs Baguette", script: "Sandwichs Baguette" },
  { id: "accompagnements", label: "Accompagnements", script: "Accompagnements" },
  { id: "boissons", label: "Boissons Maison", script: "Boissons Maison" },
  { id: "desserts", label: "Desserts", script: "Desserts" },
];

export const sauces = ["Sauce Niamey", "Piment maison", "Sriracha"];
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

export const items: SeedDish[] = [
  // ENTRÉES
  D({ cat: "entrees", name: "Pastels Thon", desc: "4 pièces · feuilletés croustillants au thon relevé", price: 6, tags: ["4 pièces"], photo: null }),
  D({ cat: "entrees", name: "Pastels Viande hachée", desc: "4 pièces · bœuf haché épicé, pâte dorée", price: 7, tags: ["4 pièces"], photo: null }),
  D({ cat: "entrees", name: "Pastels Poulet", desc: "4 pièces · effiloché de poulet aux épices douces", price: 7, tags: ["4 pièces"], photo: null }),
  D({ cat: "entrees", name: "Salade composée", desc: "Salade fraîche, tomates cerises, vinaigrette à l'huile d'olive", price: 4, photo: photo(21), tags: ["Végé"] }),
  D({ cat: "entrees", name: "Patates fourrées", desc: "4 pièces · pommes de terre garnies, panées maison", price: 4, tags: ["4 pièces"], photo: null }),

  // SALADES & BOWLS (gamme traiteur / healthy)
  D({ cat: "salades", name: "Salade Saumon Fumé", desc: "Saumon fumé, mesclun, poivrons, oignon rouge, graines torréfiées", price: 10.5, photo: photo(34), badge: "Healthy", popular: true }),
  D({ cat: "salades", name: "Bowl Quinoa Saumon Avocat", desc: "Quinoa, saumon fumé, avocat, pomme de terre, citron vert, sauce yaourt-herbes", price: 11.5, photo: photo(36), badge: "Healthy" }),
  D({ cat: "salades", name: "Salade Pâtes & Poulet", desc: "Torsades, poulet grillé, mozzarella, olives, poivrons, herbes fraîches", price: 9.9, photo: photo(37) }),
  D({ cat: "salades", name: "Salade Poulet Mozzarella", desc: "Poulet mariné, billes de mozzarella, crudités, graines de tournesol", price: 9.9, photo: photo(38) }),
  D({ cat: "salades", name: "Salade César Avocat", desc: "Poulet grillé, avocat, parmesan, œuf, croûtons, sauce césar", price: 10.5, photo: photo(39), popular: true }),
  D({ cat: "salades", name: "Salade Viande Séchée", desc: "Bresaola, copeaux de parmesan, avocat, glaçage balsamique", price: 11.5, photo: photo(41), badge: "Healthy" }),

  // SAVEUR DU MAGHREB (tajines)
  D({ cat: "maghreb", name: "Tajine Veau & Pruneaux", desc: "Veau fondant, œuf, pruneaux, amandes & sésame", price: 13, photo: photo(11), popular: true }),
  D({ cat: "maghreb", name: "Tajine Poulet aux Légumes", desc: "Poulet, petits pois, pommes de terre, carottes, olives", price: 13.9, photo: photo(16) }),
  D({ cat: "maghreb", name: "Tajine Boulettes de Bœuf", desc: "Boulettes de bœuf, sauce tomate, œuf & frites maison", price: 12, photo: photo(14) }),

  // SAVEUR D'ASIE
  D({ cat: "asiatique", name: "Loc Lac Bœuf", desc: "Émincé de bœuf sauté, sauce loc lac, riz & œuf", price: 12, badge: "Nouveau", photo: null }),
  D({ cat: "asiatique", name: "Bo Bun", desc: "Vermicelles, bœuf sauté, nem, crudités, herbes & cacahuètes", price: null, badge: "Bientôt", photo: null }),
  D({ cat: "asiatique", name: "Nouilles Sautées", desc: "Nouilles wok, légumes croquants, viande au choix", price: null, badge: "Bientôt", photo: null }),

  // SAVEUR AFRICAINE
  D({ cat: "africaine", name: "Tcheb Poulet", desc: "Riz au gras façon thiéboudienne, poulet mijoté", price: 11, photo: photo(4), options: [rizOpt], popular: true }),
  D({ cat: "africaine", name: "Tcheb Bœuf", desc: "Riz au gras, bœuf fondant, légumes confits", price: 12, photo: photo(24), options: [rizOpt] }),
  D({ cat: "africaine", name: "Tcheb Poisson", desc: "Riz au gras, poisson frit entier, légumes & sauce", price: 13, photo: photo(28), options: [rizOpt], popular: true }),
  D({ cat: "africaine", name: "Yassa Poulet", desc: "Poulet braisé, sauce oignon-citron, olives, riz blanc", price: 11, photo: photo(30), popular: true }),
  D({ cat: "africaine", name: "Yassa Bœuf", desc: "Bœuf, sauce oignon-citron confite, olives, riz blanc", price: 12, photo: photo(22) }),
  D({ cat: "africaine", name: "Mafé Bœuf", desc: "Bœuf mijoté, sauce arachide onctueuse, riz blanc", price: 12, photo: photo(1), popular: true }),
  D({ cat: "africaine", name: "Mafé Poulet", desc: "Poulet, sauce arachide, riz parfumé", price: 11, photo: photo(8) }),
  D({ cat: "africaine", name: "Athiéké Poisson", desc: "Semoule de manioc, poisson grillé, sauce & crudités", price: 13, photo: photo(31) }),

  // GRILLADES
  D({ cat: "grillades", name: "Brochette Poulet", desc: "2 pièces · poulet mariné grillé · 1 accompagnement au choix", price: 12, photo: photo(0), tags: ["2 pièces", "+ accompagnement"] }),
  D({ cat: "grillades", name: "Brochette Bœuf", desc: "2 pièces · bœuf grillé aux épices · 1 accompagnement au choix", price: 13.5, photo: photo(12), tags: ["2 pièces", "+ accompagnement"] }),
  D({ cat: "grillades", name: "Poisson Entier", desc: "Dorade entière grillée (selon arrivage) · 1 accompagnement", price: 18, photo: photo(29), tags: ["selon arrivage"] }),
  D({ cat: "grillades", name: "Poulet Braisé", desc: "Demi-poulet braisé maison · 1 accompagnement au choix", price: 12, photo: photo(17), tags: ["+ accompagnement"] }),

  // SANDWICHS BAGUETTE — 3 formules
  D({ cat: "sandwichs", name: "Banh Mì", desc: "Baguette, bœuf ou poulet, carotte, concombre, coriandre", price: 6.5, tags: ["Seul"], photo: null, options: [{ name: "Viande", required: true, choices: [{ l: "Bœuf" }, { l: "Poulet" }] }] }),
  D({ cat: "sandwichs", name: "Merguez", desc: "Baguette merguez grillées · sauce au choix", price: 6.5, formules: [["Seul", 6.5], ["+ Frites", 7.5], ["+ Frites + Boisson", 8.5]], photo: null }),
  D({ cat: "sandwichs", name: "Brochette Poulet", desc: "Baguette, brochette de poulet grillé · sauce au choix", price: 7, formules: [["Seul", 7], ["+ Frites", 8], ["+ Frites + Boisson", 9]], photo: null }),
  D({ cat: "sandwichs", name: "Kefta", desc: "Baguette kefta de bœuf épicée · sauce au choix", price: 7.5, formules: [["Seul", 7.5], ["+ Frites", 8.5], ["+ Frites + Boisson", 9.5]], photo: null }),
  D({ cat: "sandwichs", name: "Brochette Bœuf", desc: "Baguette, brochette de bœuf grillé · sauce au choix", price: 8, formules: [["Seul", 8], ["+ Frites", 9], ["+ Frites + Boisson", 10]], photo: null }),

  // ACCOMPAGNEMENTS
  D({ cat: "accompagnements", name: "Riz blanc", desc: "Riz parfumé nature", price: 2.99, photo: photo(18) }),
  D({ cat: "accompagnements", name: "Alloco", desc: "Bananes plantain frites, caramélisées", price: 3.99, photo: photo(9), popular: true }),
  D({ cat: "accompagnements", name: "Riz rouge", desc: "Riz au gras tomaté", price: 3.99, photo: photo(15) }),
  D({ cat: "accompagnements", name: "Tcheb blanc", desc: "Riz blanc façon tcheb", price: 3.99, photo: photo(18) }),
  D({ cat: "accompagnements", name: "Frites maison", desc: "Frites de pomme de terre fraîches", price: 3.99, photo: photo(27) }),
  D({ cat: "accompagnements", name: "Salade composée", desc: "Crudités, tomates, vinaigrette", price: 3.99, photo: photo(21) }),
  D({ cat: "accompagnements", name: "Patate fourrée", desc: "Pomme de terre garnie panée", price: 3.99, photo: null }),
  D({ cat: "accompagnements", name: "Piment frais", desc: "Piment frais haché", price: 0.5, photo: null }),
  D({ cat: "accompagnements", name: "Sauce verte", desc: "Sauce herbes maison", price: 1, photo: null }),
  D({ cat: "accompagnements", name: "Sauce Niamey", desc: "La sauce signature de la maison", price: 0.5, photo: null }),

  // BOISSONS MAISON
  D({ cat: "boissons", name: "Jus de Gingembre", desc: "Pressé maison · 50 cl", price: 3.5, photo: photo(2), tags: ["50 cl"], popular: true }),
  D({ cat: "boissons", name: "Jus de Bissap", desc: "Infusion d'hibiscus · 50 cl", price: 3.5, photo: photo(26), tags: ["50 cl"] }),
  D({ cat: "boissons", name: "Cocktail Maison", desc: "Selon saison · 25 cl", price: 3.5, photo: photo(20), tags: ["25 cl", "Selon saison"] }),
  D({ cat: "boissons", name: "Jus d'Avocat", desc: "Préparé à la commande", price: 4, photo: null, tags: ["À la commande"] }),
  D({ cat: "boissons", name: "Jus d'Orange", desc: "Pressé du jour", price: 3.5, photo: null }),
  D({ cat: "boissons", name: "Canette 33 cl", desc: "Coca, Coca Zéro, Sprite, Fanta, Ice Tea, Tropico, Orangina, Eau", price: 2, photo: null }),

  // DESSERTS
  D({ cat: "desserts", name: "Degué", desc: "Couscous de mil au lait fermenté, vanille · 1 portion", price: 3.5, photo: photo(6), popular: true }),
  D({ cat: "desserts", name: "Ananas frais", desc: "Ananas découpé, feuille de menthe", price: 3.5, photo: photo(13) }),
  D({ cat: "desserts", name: "Fondant Chocolat", desc: "Cœur coulant au chocolat noir", price: 4, photo: null }),
  D({ cat: "desserts", name: "Panna Cotta", desc: "Coulis au choix : mangue · fruits rouges · passion", price: 4, photo: null }),
  D({ cat: "desserts", name: "Mousse au Chocolat", desc: "Mousse maison onctueuse", price: 4, photo: null }),
];

// attache la liste des sauces aux sandwichs
items.forEach((it) => {
  if (it.cat === "sandwichs") {
    it.options = (it.options || []).concat([
      { name: "Sauce", required: true, choices: sauces.map((s) => ({ l: s })) },
    ]);
  }
});

export const formules: Formule[] = [
  { id: "f1", name: "Entrée + Plat", priceCents: 1600, desc: "Pastel, patates fourrées ou salade composée + plat africain ou tajine poulet", extra: "+ 1 canette 33 cl incluse" },
  { id: "f2", name: "Plat + Dessert", priceCents: 1600, desc: "Plat africain ou tajine poulet + un dessert de la carte", extra: "+ 1 canette 33 cl incluse" },
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
