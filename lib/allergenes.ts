/* Transcription du tableau des allergènes remis par la cliente le 2026-08-14.
 *
 * ⚠️ **Cette table est une base, pas une vérité.** Le document source le dit
 * lui-même : elle est à valider contre les recettes réelles, les fiches
 * fournisseurs et les risques de contamination croisée. L'information
 * allergènes engage la responsabilité du restaurant (règlement UE 1169/2011),
 * et une erreur ici peut envoyer quelqu'un à l'hôpital.
 *
 * Elle ne sert donc qu'**une fois** : `npm run db:allergenes` la verse en base,
 * après quoi la source de vérité devient la base, modifiable depuis
 * *Admin → Plats*. Relancer le script écraserait les corrections faites depuis.
 *
 * Les noms sont ceux de la base **après** le renommage Thiéboudiène : le
 * tableau d'origine disait encore « Tcheb ». Les plats absents de cette table
 * — les six plats sur commande — gardent une liste vide, ce qui n'affirme rien.
 */

import type { Allergen } from "@/lib/types";

/** Plat → allergènes présents dans la recette. Nom exact tel qu'en base. */
export const ALLERGENES_PAR_PLAT: Record<string, Allergen[]> = {
  // ── Entrées ──────────────────────────────────────────────────
  "Pastels Thon": ["gluten", "oeufs", "poissons"],
  "Pastels Viande hachée": ["gluten", "oeufs"],
  "Pastels Poulet": ["gluten", "oeufs"],
  "Salade composée": ["moutarde"],
  "Patates fourrées au fromage": ["gluten", "oeufs", "lait"],

  // ── Salades & Bowls ──────────────────────────────────────────
  "Salade Saumon Avocat": ["poissons", "moutarde"],
  "Salade Pâtes & Poulet": ["gluten", "lait", "moutarde"],
  "Salade Poulet Mozzarella": ["lait", "moutarde"],
  "Salade César Avocat": ["gluten", "oeufs", "poissons", "lait", "moutarde"],
  "Cecina de Bœuf": ["lait", "sulfites"],

  // ── Saveur du Maghreb ────────────────────────────────────────
  "Tajine Veau & Pruneaux": ["oeufs", "fruits_a_coque", "sesame"],
  "Tajine Poulet aux Légumes": ["celeri", "sulfites"],
  "Tajine Boulettes de Bœuf": ["gluten", "oeufs"],
  /* Couscous : la semoule de blé porte le gluten, le bouillon des sept légumes
   * le céleri. Le royal y ajoute les merguez, d'où les sulfites. */
  "Couscous Poulet": ["gluten", "celeri"],
  "Couscous Royal": ["gluten", "celeri", "sulfites"],

  // ── Saveur Méditerranéenne ───────────────────────────────────
  Chakchouka: ["oeufs"],
  "Salade d'Aubergines (Zaalouk)": [],
  "Sardines Frites": ["gluten", "poissons"],

  // ── Saveur d'Afrique de l'Ouest ──────────────────────────────
  "Thiéboudiène Poulet": ["poissons", "celeri"],
  "Thiéboudiène Bœuf": ["celeri"],
  "Thiéboudiène Poisson": ["poissons", "celeri"],
  "Yassa Poulet": ["moutarde", "sulfites"],
  "Mafé Bœuf": ["arachides"],
  "Mafé Poulet": ["arachides"],

  // ── Grillades ────────────────────────────────────────────────
  "Agneau Braisé": ["moutarde"],
  "Brochette Poulet": ["moutarde"],
  "Brochette Bœuf": ["moutarde"],
  "Poulet Rôti": [],
  "Cuisse de Poulet": [],
  "Pilon de Poulet": [],
  "Ailes de Poulet": ["soja"],
  "Poisson Entier Grillé": ["poissons"],

  // ── Sandwichs ────────────────────────────────────────────────
  "Sandwich Merguez": ["gluten", "moutarde"],
  "Sandwich Brochette Poulet": ["gluten", "moutarde"],
  "Sandwich Kefta": ["gluten", "moutarde"],
  "Sandwich Brochette Bœuf": ["gluten", "moutarde"],

  // ── Accompagnements & sauces ─────────────────────────────────
  "Riz Blanc": [],
  Alloco: [],
  "Riz Rouge": ["celeri"],
  "Thiéboudiène blanc": ["celeri"],
  "Frites Maison": [],
  "Salade Composée": ["moutarde"],
  "Patate fourrée au fromage": ["gluten", "oeufs", "lait"],
  "Sauce Ô3 Verte": ["lait", "moutarde"],
  "Sauce Ô3 Piquante": ["sulfites"],
  "Piment frais": [],

  // ── Boissons ─────────────────────────────────────────────────
  "Jus de Gingembre": [],
  "Jus de Bissap": [],
  "Cocktail Maison": ["sulfites"],
  "Jus d'Avocat": ["lait"],
  "Jus d'Orange": [],

  /* Le tableau ne connaît qu'une ligne « Canette 33 cl » ; la base vend sept
   * références depuis l'éclatement du plat fourre-tout. Aucune ne contient
   * d'allergène réglementaire. */
  "Coca-Cola 33 cl": [],
  "Sprite 33 cl": [],
  "Fanta 33 cl": [],
  "Ice Tea 33 cl": [],
  "Orangina 33 cl": [],
  "Tropico 33 cl": [],
  "Eau minérale 50 cl": [],

  // ── Desserts ─────────────────────────────────────────────────
  "Ananas frais": [],
  Tiramisu: ["gluten", "oeufs", "lait"],
  "Fondant Chocolat": ["gluten", "oeufs", "soja", "lait"],
  "Mousse au Chocolat": ["oeufs", "soja", "lait"],
  "Tarte du jour": ["gluten", "oeufs", "lait"],
};
