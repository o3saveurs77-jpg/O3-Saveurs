# Réconciliation de la carte — base de production vs maquette de référence

Généré le 2026-08-05. Compare les 55 plats actuellement en base (Neon prod) à la
référence fournie par le client (`o3-saveurs-site-complet.html` /
`o3-saveurs-backoffice.html`, 53 plats), déjà reprise dans `lib/menu.ts` pour
les futurs seeds. **Rien n'a été modifié en base** — ce document sert de liste
de contrôle pour appliquer les changements retenus via `/admin/plats`,
`/admin/reglages` et `/admin/zones`.

⚠️ **Plusieurs prix de la référence sont plus bas que les prix actuels**
(grillades, tajines, salades notamment). Les appliquer fait baisser des prix
réels facturés aux clients — à valider avec la cliente avant toute action,
ce n'est pas un simple alignement cosmétique.

## 1. Identité & zones (déjà fait dans le code, à appliquer en base)

- **`/admin/reglages`** → adresse : `38 rue des Prés Saint-Martin` / `77340` /
  `Pontault-Combault` (remplace `6 bis rue du Village` / `77185` / `Lognes`).
- **`/admin/zones`** → remplacer les 4 zones actuelles (tarif unique 15 €/4 €)
  par les 4 paliers de la référence :

  | Zone | Villes | Minimum | Frais |
  |---|---|---|---|
  | 1 | Pontault-Combault, Roissy-en-Brie, Ozoir-la-Ferrière | 15 € | 2,50 € |
  | 2 | Émerainville, Croissy-Beaubourg, Pontcarré, Lognes | 20 € | 3,50 € |
  | 3 | Noisiel, Torcy, Champs-sur-Marne, Brou-sur-Chantereine | 25 € | 4,50 € |
  | 4 | Bussy-Saint-Georges, Noisy-le-Grand, Chelles, Lagny-sur-Marne | 35 € | 5,50 € |

## 2. Catégorie à remplacer : Asie → Méditerranée

`Saveur d'Asie` (Loc Lac Bœuf, Bo Bun, Nouilles Sautées) n'existe pas dans la
référence — elle prévoit `Saveur Méditerranéenne` à la place. Deux options :
**(a)** désactiver/supprimer les 3 plats Asie et créer la catégorie Méditerranée
avec les 3 plats ci-dessous, ou **(b)** garder les deux si la cliente veut
conserver l'offre asiatique en plus. À trancher avec elle — c'est le cœur du
sujet "la carte ne correspond pas à ce qui a été présenté".

| Plat à créer | Prix | Description |
|---|---|---|
| Chakchouka | 5,00 € | Tomates, poivrons, oignons & épices — mijoté parfumé. |
| Salade d'Aubergines | 5,00 € | Caviar d'aubergines à la marocaine, tomate, ail & cumin — le zaalouk. |
| Sardines Frites | 8,00 € | Sardines fraîches, sel & citron — juste saisies, croustillantes. |

## 3. Plats à renommer / reprix (même plat, fiche à mettre à jour)

| Catégorie | Nom actuel | → Nouveau nom | Prix actuel | → Nouveau prix |
|---|---|---|---|---|
| Africaine | Tcheb Poulet | Thiéboudiène Poulet | 11,00 € | 8,50 € |
| Africaine | Tcheb Bœuf | Thiéboudiène Bœuf | 12,00 € | 9,50 € |
| Africaine | Tcheb Poisson | Thiéboudiène Poisson | 13,00 € | 13,00 € (inchangé) |
| Africaine | Yassa Poulet | (inchangé) | 11,00 € | 8,50 € |
| Africaine | Mafé Bœuf | (inchangé) | 12,00 € | 9,50 € |
| Maghreb | Tajine Veau & Pruneaux | (inchangé) | 13,00 € | 10,50 € |
| Maghreb | Tajine Poulet aux Légumes | (inchangé) | 13,90 € | 9,00 € |
| Maghreb | Tajine Boulettes de Bœuf | (inchangé) | 12,00 € | 9,50 € |
| Salades | Salade Saumon Fumé | Salade Saumon Avocat | 10,50 € | 9,00 € |
| Salades | Salade Pâtes & Poulet | (inchangé) | 9,90 € | 8,40 € |
| Salades | Salade Poulet Mozzarella | (inchangé) | 9,90 € | 8,40 € |
| Salades | Salade César Avocat | (inchangé) | 10,50 € | 9,00 € |
| Salades | Salade Viande Séchée | Cecina de Bœuf | 11,50 € | 10,00 € |
| Grillades | Brochette Poulet | (inchangé) | 12,00 € | 7,00 € |
| Grillades | Brochette Bœuf | (inchangé) | 13,50 € | 8,00 € |
| Grillades | Poisson Entier | Poisson Entier Grillé | 18,00 € | 18,00 € (inchangé) |
| Grillades | Poulet Braisé | Poulet Rôti | 12,00 € | 8,00 € |
| Sandwichs | Merguez | Sandwich Merguez | 6,50 € | 6,50 € (inchangé) |
| Sandwichs | Brochette Poulet | Sandwich Brochette Poulet | 7,00 € | 7,00 € (inchangé) |
| Sandwichs | Kefta | Sandwich Kefta | 7,50 € | 7,50 € (inchangé) |
| Sandwichs | Brochette Bœuf | Sandwich Brochette Bœuf | 8,00 € | 8,00 € (inchangé) |
| Entrées | Patates fourrées | Patates fourrées au fromage | 4,00 € | 4,00 € (inchangé) |
| Accomp. | Riz blanc | Riz Blanc | 2,99 € | 2,50 € |
| Accomp. | Alloco | (inchangé) | 3,99 € | 4,00 € |
| Accomp. | Riz rouge | Riz Rouge | 3,99 € | 4,00 € |
| Accomp. | Tcheb blanc | Thiéboudiène blanc | 3,99 € | 4,00 € |
| Accomp. | Frites maison | Frites Maison | 3,99 € | 4,00 € |
| Accomp. | Salade composée | Salade Composée | 3,99 € | 4,00 € |
| Accomp. | Patate fourrée | Patate fourrée au fromage | 3,99 € | 4,00 € |
| Accomp. | Sauce verte | Sauce Ô3 Verte | 1,00 € | 1,00 € (inchangé) |
| Accomp. | Sauce Niamey | Sauce Ô3 Piquante | 0,50 € | 1,00 € |
| Desserts | Ananas frais | (inchangé) | 3,50 € | 2,50 € |
| Desserts | Fondant Chocolat | (inchangé) | 4,00 € | 3,00 € |
| Desserts | Mousse au Chocolat | (inchangé) | 4,00 € | 3,00 € |

## 4. Plats de la base absents de la référence — à trancher (garder / retirer)

Probablement de vrais plats de la maison ajoutés après coup : la référence ne
les liste pas, ce qui ne veut pas dire qu'il faut les supprimer. Décision à
prendre avec la cliente.

- Africaine : **Yassa Bœuf**, **Mafé Poulet**, **Athiéké Poisson**
- Salades : **Bowl Quinoa Saumon Avocat**
- Sandwichs : **Banh Mì**
- Desserts : **Degué**, **Panna Cotta**

## 5. Plats de la référence absents de la base — à créer si conservés

| Catégorie | Plat | Prix |
|---|---|---|
| Grillades | Cuisse de Poulet | 3,00 € |
| Grillades | Pilon de Poulet | 5,00 € |
| Grillades | Ailes de Poulet | 5,00 € |
| Desserts | Tiramisu | 2,50 € |
| Desserts | Tarte du jour | 3,00 € |

## 6. Formules — déjà fait, rien à faire en base

Les 5 formules de la page d'accueil (Express 10,90 €, Midi 13,90 €, Gourmande
16,90 €, Sandwich 11,90 €, Menu Enfant 8,90 €) sont codées en dur dans
`lib/menu.ts` (pas en base) — déjà mises à jour dans le code, effectives dès
le prochain déploiement, aucune action admin nécessaire.

## 7. Plats du jour

Déjà corrects dans le code (`Sardines grillées` mercredi, `Paëlla` jeudi,
`Couscous Royal` vendredi) — c'est la référence elle-même. Aucun prix n'est
prévu pour eux dans la maquette : ce n'était donc peut-être pas une erreur
mais un choix (annonce sans prix affiché). Point à reconfirmer avec la
cliente avant de leur donner un prix ou de les laisser désactivés.

## 8. Photos

22 des 55 plats actuels n'ont aucune photo (illustration générique affichée à
la place). Ce document ne couvre que le texte/prix — les photos restent à
fournir séparément, plat par plat, dans `/admin/plats`.
