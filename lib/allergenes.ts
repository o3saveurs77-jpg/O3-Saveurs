/* Transcription du tableau des allergènes remis par la cliente le 2026-08-14,
 * complétée par le tableau C du « Pack Andryss » du 2026-10-25.
 *
 * ⚠️ **Cette table est une base, pas une vérité.** Le document source le dit
 * lui-même : elle est à valider contre les recettes réelles, les fiches
 * fournisseurs et les risques de contamination croisée. L'information
 * allergènes engage la responsabilité du restaurant (règlement UE 1169/2011),
 * et une erreur ici peut envoyer quelqu'un à l'hôpital. Le Pack d'octobre
 * mêle allergènes présents et « à confirmer » : les deux sont saisis tant que
 * Laila n'a pas validé les recettes.
 *
 * Elle ne sert donc qu'**une fois** : `npm run db:allergenes` la verse en base,
 * après quoi la source de vérité devient la base, modifiable depuis
 * *Admin → Plats*. Relancer le script écraserait les corrections faites depuis.
 *
 * Elle sert aussi à la page Allergènes : un plat sans allergène n'y est dit
 * « examiné » que s'il figure ici. D'où les listes vides, qui affirment
 * l'absence, et les boissons listées une à une.
 */

import type { Allergen } from "@/lib/types";

/** Plat → allergènes présents dans la recette. Nom exact tel qu'en base. */
export const ALLERGENES_PAR_PLAT: Record<string, Allergen[]> = {
  // ── Entrées ──────────────────────────────────────────────────
  "Pastels Thon": ["gluten", "oeufs", "poissons"],
  "Pastels Viande hachée": ["gluten", "oeufs", "celeri"],
  "Pastels Poulet": ["gluten", "oeufs", "celeri"],
  "Salade composée": ["moutarde"],
  "Patates fourrées au fromage": ["gluten", "oeufs", "lait"],
  Pastilla: ["gluten", "crustaces", "oeufs", "poissons", "lait", "fruits_a_coque", "sesame", "mollusques"],

  // ── Salades & Bowls ──────────────────────────────────────────
  "Salade Saumon Avocat": ["gluten", "poissons", "moutarde"],
  "Salade Pâtes & Poulet": ["gluten", "oeufs", "lait", "moutarde"],
  "Salade Poulet Mozzarella": ["gluten", "lait", "moutarde"],
  "Salade César Avocat": ["gluten", "oeufs", "poissons", "lait", "moutarde"],
  "Cecina de Bœuf": ["gluten", "lait", "moutarde", "sulfites"],

  // ── Saveur du Maghreb ────────────────────────────────────────
  "Tajine Veau & Pruneaux": ["gluten", "oeufs", "fruits_a_coque", "sesame"],
  "Tajine Poulet Olives & Citron confit": ["celeri", "sulfites"],
  "Tajine Boulettes de Bœuf": ["gluten", "oeufs", "celeri"],
  /* Couscous : la semoule de blé porte le gluten, le bouillon des sept légumes
   * le céleri. Le royal y ajoute les merguez, d'où les sulfites. */
  "Couscous Poulet": ["gluten", "celeri"],
  "Couscous Royal": ["gluten", "celeri", "sulfites"],
  "Couscous Végétarien": ["gluten", "celeri"],

  // ── Saveur Méditerranéenne ───────────────────────────────────
  Chakchouka: ["gluten", "oeufs"],
  "Salade d'Aubergines (Zaalouk)": ["gluten", "sesame"],
  "Salade Marocaine": ["gluten", "moutarde"],

  // ── Saveur d'Afrique de l'Ouest ──────────────────────────────
  "Thiéboudiène Poulet": ["poissons", "celeri", "mollusques"],
  "Thiéboudiène Bœuf": ["poissons", "celeri", "mollusques"],
  "Thiéboudiène Poisson": ["crustaces", "poissons", "celeri", "mollusques"],
  "Yassa Poulet": ["celeri", "moutarde", "sulfites"],
  "Mafé Bœuf": ["arachides", "celeri"],
  "Mafé Poulet": ["arachides", "celeri"],

  // ── Grillades ────────────────────────────────────────────────
  "Brochette d'agneau braisé": ["moutarde"],
  "Brochette Poulet": ["moutarde"],
  "Brochette Bœuf": ["moutarde"],
  "Poulet Rôti": [],
  "Cuisse de Poulet": [],
  "Pilon de Poulet": [],
  "Ailes de Poulet": ["soja"],
  "Poisson Entier Grillé": ["poissons"],

  // ── Sandwichs ────────────────────────────────────────────────
  "Sandwich Merguez": ["gluten", "oeufs", "moutarde"],
  "Sandwich Brochette Poulet": ["gluten", "oeufs", "moutarde"],
  "Sandwich Kefta": ["gluten", "oeufs", "moutarde"],
  "Sandwich Brochette Bœuf": ["gluten", "oeufs", "moutarde"],

  // ── Accompagnements & sauces ─────────────────────────────────
  "Riz Blanc": [],
  Alloco: [],
  "Riz Rouge": ["poissons", "celeri"],
  "Thiéboudiène blanc": ["poissons", "celeri"],
  "Frites Maison": [],
  "Salade Composée": ["moutarde"],
  "Patate fourrée au fromage": ["gluten", "oeufs", "lait"],
  "Sauce Ô3 Verte": ["oeufs", "lait", "moutarde"],
  "Sauce Ô3 Piquante": ["oeufs", "moutarde", "sulfites"],
  "Piment frais": [],

  // ── Boissons ─────────────────────────────────────────────────
  "Jus de Gingembre": [],
  "Jus de Bissap": [],
  "Cocktail Maison": ["sulfites"],
  "Jus d'Avocat": ["lait"],
  "Jus d'Orange": [],

  // Canettes et bouteilles : aucune ne contient d'allergène réglementaire.
  "Coca-Cola 33 cl": [],
  "Sprite 33 cl": [],
  "Fanta 33 cl": [],
  "Ice Tea 33 cl": [],
  "Orangina 33 cl": [],
  "Tropico 33 cl": [],
  "Volvic 50 cl": [],
  "Coca-Cola 1,5 L": [],
  "Sprite 1,5 L": [],
  "Fanta 1,5 L": [],
  "Ice Tea 1,5 L": [],
  "Orangina 1,5 L": [],
  "Tropico 1,5 L": [],
  "Volvic 1,5 L": [],

  // ── Desserts ─────────────────────────────────────────────────
  "Ananas frais": [],
  Tiramisu: ["gluten", "oeufs", "lait"],
  "Fondant Chocolat": ["gluten", "oeufs", "soja", "lait"],
  "Mousse au Chocolat": ["oeufs", "soja", "lait"],
  "Tarte du jour": ["gluten", "oeufs", "lait", "fruits_a_coque"],
  "Panna Cotta": ["lait"],

  // ── Sur commande ─────────────────────────────────────────────
  "Gigot d'agneau": [],
  "Épaule d'agneau": [],
  "Couscous marocain": ["gluten", "celeri"],
  Paella: ["crustaces", "poissons", "celeri", "mollusques"],
  "Demi-agneau": [],
  "Agneau entier": [],
};
