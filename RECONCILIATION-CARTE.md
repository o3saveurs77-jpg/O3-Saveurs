# Réconciliation de la carte — base de production vs carte officielle

> ## Carte FINALE du 2026-08-12 — ce qu'elle change
>
> `O3-Saveurs Carte-FINALE-corrigee.pdf` (53 références numérotées + 5 formules,
> 65 pages) remplace `O3-Saveurs Carte-mise-a-jour.pdf` comme source de vérité.
>
> **Elle confirme l'intégralité de la transcription de `lib/menu.ts`** — les 53
> plats, tous les prix, toutes les familles, les 5 formules et leurs
> suppléments. Vérifié page à page. Un seul point change, et c'est un
> retournement :
>
> **Les plats sénégalais s'appellent « Thiéboudiène », plus « Tcheb ».**
> La carte du 6 août disait *Tcheb* ; la carte finale écrit *Thiéboudiène*
> partout — bandeau de famille, index p. 24, trois fiches plat, accompagnement
> n° 36, et jusqu'à la mention de supplément au bas de la page des formules.
> Voir §12.
>
> Restent hors carte, volontairement : les 7 références de canettes (§11, la
> carte n'affiche qu'une ligne « Canette 33 cl · 2,00 € ») et les 6 plats
> « sur commande », que la carte imprimée ne mentionne nulle part.
>
> ⚠️ **Le PDF est techniquement défectueux** — voir §13. Il est correct à
> l'écran et à l'impression, mais tout ce qui en lit le texte (moteur de
> recherche, copier-coller, imprimeur, lecteur d'écran) y trouvera d'anciens
> prix.

---

Vérifié le 2026-08-06, mis à jour le 2026-08-12. Compare les **55 plats en
base** (Neon prod, ce que le site vend réellement aujourd'hui) aux **53 plats
de la carte officielle**.

La carte PDF fait foi. Elle remplace les maquettes HTML
(`o3-saveurs-site-complet.html`, `o3-saveurs-backoffice.html`) sur lesquelles
s'appuyait la version précédente de ce document.

**Rien n'a été modifié en base.** `lib/menu.ts` (le seed) est en revanche aligné
sur le PDF. Ce document est la liste de contrôle pour appliquer les changements
via `/admin/plats`, `/admin/categories` et `/admin/reglages`.

> ⚠️ **La majorité des corrections font baisser des prix réellement facturés.**
> Un Tajine Poulet passe de 13,90 € à 9,00 €, une Brochette Bœuf de 13,50 € à
> 8,00 €. Ce n'est pas un alignement cosmétique : à confirmer avec la cliente
> que ces prix sont bien ceux qu'elle veut pratiquer.

---

## Résumé

| | Base (aujourd'hui) | Carte officielle | Écart |
|---|---|---|---|
| Plats | 55 | 53 | **10 à retirer, 8 à créer** |
| Prix justes | 29 | — | **26 prix faux** |
| Noms justes | 43 | — | **12 renommages** |
| Catégories | 10 (dont « Asie ») | 10 (dont « Méditerranée ») | **1 à supprimer, 1 à créer** |
| Formules | 0 (table absente) | 5 | **5 non vendables** |

Deux familles sont déjà **100 % conformes** : **Boissons** (6/6, noms et prix) et
**Entrées** (5/5 prix justes, un seul nom à compléter).

---

## 1. Catégorie « Asie » → « Méditerranée »

La base a une catégorie `asiatique` (Saveur d'Asie) que la carte officielle ne
connaît pas ; à l'inverse la carte a une famille **Saveur Méditerranéenne**
absente de la base.

⚠️ **Piège à connaître avant de déployer** : la liste des catégories affichées
n'est pas en base, elle est codée dans `lib/menu.ts` (`cats`), et
`MenuClient` **masque silencieusement tout plat dont la catégorie n'y figure
pas**. `lib/menu.ts` ayant déjà été aligné sur la carte, le prochain
déploiement fera disparaître les 3 plats « Asie » de la carte publique **et**
affichera une famille Méditerranée vide, tant que les plats ci-dessous
n'existent pas en base. Les deux opérations doivent aller ensemble.

**À supprimer** (catégorie `asiatique` et ses 3 plats) :

| Plat | Prix en base |
|---|---|
| Loc Lac Bœuf | 12,00 € |
| Bo Bun | **aucun prix** — invendable en l'état |
| Nouilles Sautées | **aucun prix** — invendable en l'état |

**À créer** (catégorie `medit`, libellé « Saveur Méditerranéenne », position 3) :

| Plat | Prix | Description |
|---|---|---|
| Chakchouka | 5,00 € | Tomates, poivrons, oignons & épices — mijoté parfumé. **Option supplément œuf poché +1,00 €** |
| Salade d'Aubergines (Zaalouk) | 5,00 € | Caviar d'aubergines à la marocaine, tomate, ail & cumin. |
| Sardines Frites | 8,00 € | Sardines fraîches, sel & citron — juste saisies, croustillantes. |

---

## 2. Prix à corriger (26)

### Salades & Bowls

| Plat en base | Prix actuel | → Prix carte | Écart |
|---|---|---|---|
| Salade Saumon Fumé → **Salade Saumon Avocat** | 10,50 € | 9,00 € | −1,50 |
| Salade Pâtes & Poulet | 9,90 € | 8,40 € | −1,50 |
| Salade Poulet Mozzarella | 9,90 € | 8,40 € | −1,50 |
| Salade César Avocat | 10,50 € | 9,00 € | −1,50 |
| Salade Viande Séchée → **Cecina de Bœuf** | 11,50 € | 10,00 € | −1,50 |

### Saveur du Maghreb

| Plat | Prix actuel | → Prix carte | Écart |
|---|---|---|---|
| Tajine Veau & Pruneaux | 13,00 € | 10,50 € | −2,50 |
| Tajine Poulet aux Légumes | 13,90 € | 9,00 € | **−4,90** |
| Tajine Boulettes de Bœuf | 12,00 € | 9,50 € | −2,50 |

### Saveur d'Afrique de l'Ouest

| Plat | Prix actuel | → Prix carte | Écart |
|---|---|---|---|
| Tcheb Poulet | 11,00 € | 8,50 € | −2,50 |
| Tcheb Bœuf | 12,00 € | 9,50 € | −2,50 |
| Tcheb Poisson | 13,00 € | 13,00 € | *inchangé* ✓ |
| Yassa Poulet | 11,00 € | 8,50 € | −2,50 |
| Mafé Bœuf | 12,00 € | 9,50 € | −2,50 |

### Grillades

| Plat | Prix actuel | → Prix carte | Écart |
|---|---|---|---|
| Brochette Poulet | 12,00 € | 7,00 € | **−5,00** |
| Brochette Bœuf | 13,50 € | 8,00 € | **−5,50** |
| Poulet Braisé → **Poulet Rôti** | 12,00 € | 8,00 € | −4,00 |
| Poisson Entier → **Poisson Entier Grillé** | 18,00 € | 18,00 € | *inchangé* ✓ |

### Accompagnements

| Plat | Prix actuel | → Prix carte | Écart |
|---|---|---|---|
| Riz blanc | 2,99 € | 2,50 € | −0,49 |
| Alloco | 3,99 € | 4,00 € | +0,01 |
| Riz rouge | 3,99 € | 4,00 € | +0,01 |
| Tcheb blanc | 3,99 € | 4,00 € | +0,01 |
| Frites maison | 3,99 € | 4,00 € | +0,01 |
| Salade composée | 3,99 € | 4,00 € | +0,01 |
| Patate fourrée → **Patate fourrée au fromage** | 3,99 € | 4,00 € | +0,01 |
| Sauce Niamey → **Sauce Ô3 Piquante** | 0,50 € | 1,00 € | **+0,50** |
| Sauce verte → **Sauce Ô3 Verte** | 1,00 € | 1,00 € | *inchangé* ✓ |
| Piment frais | 0,50 € | 0,50 € | *inchangé* ✓ |

### Desserts

| Plat | Prix actuel | → Prix carte | Écart |
|---|---|---|---|
| Ananas frais | 3,50 € | 2,50 € | −1,00 |
| Fondant Chocolat | 4,00 € | 3,00 € | −1,00 |
| Mousse au Chocolat | 4,00 € | 3,00 € | −1,00 |

---

## 3. Renommages (12)

| Catégorie | Nom en base | → Nom carte |
|---|---|---|
| Entrées | Patates fourrées | Patates fourrées au fromage |
| Salades | Salade Saumon Fumé | Salade Saumon Avocat |
| Salades | Salade Viande Séchée | Cecina de Bœuf |
| Grillades | Poulet Braisé | Poulet Rôti |
| Grillades | Poisson Entier | Poisson Entier Grillé |
| Sandwichs | Merguez | Sandwich Merguez |
| Sandwichs | Brochette Poulet | Sandwich Brochette Poulet |
| Sandwichs | Kefta | Sandwich Kefta |
| Sandwichs | Brochette Bœuf | Sandwich Brochette Bœuf |
| Accomp. | Patate fourrée | Patate fourrée au fromage |
| Accomp. | Sauce verte | Sauce Ô3 Verte |
| Accomp. | Sauce Niamey | Sauce Ô3 Piquante |

Le préfixe « Sandwich » n'est pas cosmétique : sans lui, « Brochette Poulet » et
« Brochette Bœuf » désignent **deux plats différents à deux prix différents**
(grillade 7,00 €/8,00 €, sandwich 7,00 €/8,00 €) sous le même nom — ambigu dans
le panier, en cuisine et à l'inventaire.

Deux descriptions contredisaient aussi la carte et ont été corrigées dans
`lib/menu.ts` (à reporter en base) : **Cecina de Bœuf** annonçait « burrata »
au lieu de copeaux de parmesan et glaçage balsamique, et **Poisson Entier
Grillé** « citron et persillade » au lieu de « dorade entière, selon arrivage ».

---

## 4. Plats en base absents de la carte — à retirer (10)

| Catégorie | Plat | Prix en base |
|---|---|---|
| Salades | Bowl Quinoa Saumon Avocat | 11,50 € |
| Asie | Loc Lac Bœuf | 12,00 € |
| Asie | Bo Bun | *sans prix* |
| Asie | Nouilles Sautées | *sans prix* |
| Africaine | Yassa Bœuf | 12,00 € |
| Africaine | Mafé Poulet | 11,00 € |
| Africaine | Athiéké Poisson | 13,00 € |
| Sandwichs | Banh Mì | 6,50 € |
| Desserts | Degué | 3,50 € |
| Desserts | Panna Cotta | 4,00 € |

Préférer **désactiver** (`available = false`) plutôt que supprimer : la
suppression casserait l'historique des commandes qui les référencent. Si
certains sont de vrais plats de la maison que la cliente veut garder, c'est la
carte PDF qu'il faut corriger, pas la base.

---

## 5. Plats de la carte absents de la base — à créer (8)

| Catégorie | Plat | Prix |
|---|---|---|
| Méditerranée | Chakchouka | 5,00 € |
| Méditerranée | Salade d'Aubergines (Zaalouk) | 5,00 € |
| Méditerranée | Sardines Frites | 8,00 € |
| Grillades | Cuisse de Poulet (à l'unité) | 3,00 € |
| Grillades | Pilon de Poulet (3 pièces) | 5,00 € |
| Grillades | Ailes de Poulet (5 pièces) | 5,00 € |
| Desserts | Tiramisu | 2,50 € |
| Desserts | Tarte du jour | 3,00 € |

---

## 6. Libellés de catégories

| Slug | Libellé en base | → Libellé carte |
|---|---|---|
| `africaine` | Saveur Africaine | Saveur d'Afrique de l'Ouest |
| `sandwichs` | Sandwichs Baguette | Sandwichs |
| `boissons` | Boissons Maison | Boissons |
| `asiatique` | Saveur d'Asie | *(supprimer)* |
| `medit` | *(absente)* | Saveur Méditerranéenne |

---

## 7. Formules — non vendables aujourd'hui

Les 5 formules de la carte (Express 10,90 € · Midi 13,90 € · Gourmande 16,90 € ·
Sandwich 11,90 € · Menu Enfant 8,90 €) **n'existent pas en base** : la table
`Formula` est absente, la migration `20260806090000_add_formulas` n'a pas été
déployée. La page `/formules` se construit mais ne proposera rien.

À faire : `npm run db:deploy` puis créer les formules depuis `/admin/formules`
(ou rejouer le seed sur une base neuve).

Deux suppléments imprimés sur la carte manquaient totalement et ont été ajoutés
dans `lib/menu.ts` — ils étaient jusqu'ici impossibles à facturer en ligne :

- **œuf poché +1,00 €** sur la Chakchouka ;
- **cheddar +1,00 €** sur les sandwichs.

Les suppléments de formule (`FORMULA_SUPPLEMENTS`) étaient par ailleurs indexés
sur « Thiéboudiène Poisson », un nom qui n'existe nulle part : le supplément de
4 € du **Tcheb Poisson** n'aurait jamais été appliqué, et la Formule Express
aurait vendu à 10,90 € un plat facturé 13,00 € à la carte. Corrigé.

---

## 8. Réglages

`/admin/reglages` → l'adresse en base est encore **6 bis rue du Village, 77185
Lognes**. La carte indique **38 rue des Prés Saint-Martin, 77340
Pontault-Combault**. `lib/menu.ts` est déjà à jour, la base non.

Le numéro imprimé sur le PDF (`06 00 00 00 00 00`) est un gabarit, pas un vrai
numéro : **ne pas le reprendre**. Le numéro en base (`01 72 84 52 44`) reste en
place.

Les 4 zones de livraison en base (15 €/2,50 € · 20 €/3,50 € · 25 €/4,50 € ·
35 €/5,50 €) sont **déjà conformes** — rien à faire.

---

## 9. Plats du jour

Mercredi *Sardines grillées* · Jeudi *Paëlla* · Vendredi *Couscous Royal* —
conformes au PDF, qui ne leur donne aucun prix (« En quantité limitée — pensez
à commander tôt »). Ce sont donc des annonces sans prix affiché, pas un oubli.

---

## 10. Photos

22 des 55 plats en base n'ont aucune photo et affichent l'illustration
générique. Les 8 plats à créer arriveront eux aussi sans photo. Ce document ne
couvre que le texte et les prix ; les photos sont à fournir séparément, plat par
plat, dans `/admin/plats`.

---

## 11. Canettes — un plat fourre-tout éclaté en références (2026-08-12)

La carte ne vendait qu'un plat, **« Canette 33 cl » à 2,00 €**, dont la
description énumérait six marques. Le client commandait donc « une canette »
sans dire laquelle, le bon de préparation n'indiquait pas quoi sortir du frigo,
et le stock était un compteur unique pour six produits : impossible de voir
qu'il ne restait plus de Coca tant qu'il restait du Tropico.

`lib/menu.ts` déclare désormais une famille **`canettes` — « Canettes & Eaux »**
(position 9, juste après les boissons maison) et **sept références** à 2,00 €,
TVA 5,5 % : Coca-Cola, Sprite, Fanta, Ice Tea, Orangina, Tropico, Eau minérale
50 cl. Le créneau boisson des formules ne les propose plus par construction —
l'ancienne exclusion par le nom du plat, qu'un renommage suffisait à rendre
inopérante, a été retirée.

**À appliquer en base :**

```
npm run db:canettes
```

Le script est relançable et ne touche qu'aux canettes — surtout **ne pas**
utiliser `npm run db:seed` pour cela, qui réécrirait les 26 prix de la section 2
sans que la cliente les ait validés. Il crée la famille, crée les sept
références, reporte l'ancienne canette sur les sept dans tous les créneaux de
formule où elle figurait (supplément conservé), puis **désactive** l'ancien plat
— jamais supprimé : les commandes passées le référencent.

Deux choses restent à faire à la main, parce qu'elles ne s'inventent pas :

- **Stocks** — saisir référence par référence ce qui est réellement au frigo ;
- **Plats** — la liste des sept vient de la carte imprimée, pas de l'inventaire
  réel : ajouter ou retirer selon ce que la maison tient, et revoir le prix de
  l'eau, aujourd'hui vendue au prix d'une canette faute d'un prix propre sur la
  carte.

La famille **Boissons** n'est donc plus « 6/6 conforme » comme l'annonce le
résumé plus haut : elle compte cinq boissons maison, les canettes ayant leur
propre famille.

La carte finale du 12 août **maintient la ligne unique** « Canette 33 cl ·
2,00 € · Coca, Sprite, Fanta, Ice Tea, Orangina, Tropico — et eau minérale ».
L'éclatement en sept références est donc un choix d'exploitation assumé, pas un
alignement sur la carte : le site vendra plus finement que le papier n'annonce.
Rien ne casse — les prix concordent — mais la carte imprimée range une eau
minérale de 50 cl sous un intitulé « Canette 33 cl ».

---

## 12. Tcheb → Thiéboudiène — le retournement de la carte finale (2026-08-12)

La carte du 6 août écrivait **Tcheb**. La carte finale écrit **Thiéboudiène**,
sans exception :

| Emplacement | Libellé |
|---|---|
| Bandeau de famille (p. 24) | « Thiéboudiène, mafé, yassa, attiéké » |
| Index Afrique de l'Ouest | 17 Thiéboudiène Poulet · 18 Thiéboudiène Bœuf · 19 Thiéboudiène Poisson |
| Fiches plat 17, 18, 19 | « Thiéboudiène Poulet », etc. |
| Accompagnement n° 36 | « Thiéboudiène blanc » |
| Bas de la page Formules | « Suppléments : Thiéboudiène Poisson +4 € » |

**Quatre plats à renommer**, prix inchangés :

| Aujourd'hui | Carte finale |
|---|---|
| Tcheb Poulet | Thiéboudiène Poulet |
| Tcheb Bœuf | Thiéboudiène Bœuf |
| Tcheb Poisson | Thiéboudiène Poisson |
| Tcheb blanc (accompagnement) | Thiéboudiène blanc |

### Fait dans le code (2026-08-12)

- `lib/menu.ts` — les 4 noms, la clé de `FORMULA_SUPPLEMENTS`, le commentaire
  d'en-tête qui affirmait l'inverse ;
- `lib/pageSections.ts` — l'accroche « Tcheb, yassa, mafé, athiéké », devenue
  « Thiéboudiène, yassa, mafé, attiéké » (la carte finale écrit *attiéké*).

### Reste à appliquer en base

```
npm run db:thieboudiene
```

**Le site affiche les noms de la base, pas ceux de `lib/menu.ts`.** Tant que le
script n'a pas tourné, le code dit *Thiéboudiène* et le client lit *Tcheb*.
Le script est relançable, ne touche qu'à ces quatre noms, et laisse
délibérément intactes les lignes de commande déjà passées : une facture doit
rester lisible telle qu'elle a été émise.

### Le piège, exactement

`FORMULA_SUPPLEMENTS` est indexé par le **nom** du plat, et `prisma/seed.ts`
apparie les deux au moment du seed :

```ts
supplementCents: cents(FORMULA_SUPPLEMENTS[d.name] ?? 0) ?? 0
```

Renommer le plat **sans** renommer la clé — les deux étant dans `lib/menu.ts` —
ferait donc écrire un supplément de 0 € au prochain `npm run db:seed` : le
Thiéboudiène Poisson à 13 € entrerait dans une formule à 10,90 €, et personne ne
s'en apercevrait avant la comptabilité. **Cette panne s'est déjà produite.** Les
deux ont été renommés ensemble.

En revanche, à l'exécution le supplément est lu en base
(`FormulaChoice.supplementCents`) et non par le nom : renommer les plats en base
ne l'efface pas. Le désaccord entre le code et la base ne coûte donc pas le
supplément — seulement un nom faux à l'écran, jusqu'au prochain seed.

---

## 13. Le PDF final est techniquement défectueux (2026-08-12)

`O3-Saveurs Carte-FINALE-corrigee.pdf` pèse **119 Mo** pour 65 pages. Il a été
produit par `pypdf` en **superposant** les corrections successives sur les
versions précédentes **sans supprimer l'ancien contenu**. Chaque page porte
deux à trois couches de texte mortes.

À l'écran et à l'impression, le résultat est juste : les couches récentes sont
opaques et recouvrent les anciennes. Mais tout ce qui lit le *texte* plutôt que
l'image y trouve d'anciennes valeurs — la page Chakchouka contient à la fois
`5,00` (visible) et `6,00` (masqué), la page Tajine Poulet `9,00` et `11,40`, et
jusqu'à trois numérotations de page concurrentes.

Ce qui en pâtit :

- **Copier-coller** depuis le PDF : prix faux, sans avertissement ;
- **Recherche (Ctrl+F)** : trouve des plats à des prix qui n'existent plus ;
- **Imprimeur** : un flux de prépresse qui aplatit ou re-compose le texte peut
  faire remonter la couche du dessous ;
- **Envoi par email** : 119 Mo passent rarement.

**À demander** : un export à plat depuis l'outil de création (Canva, InDesign…),
pas une nouvelle superposition. Un PDF de cette carte doit peser quelques
mégaoctets, pas cent dix-neuf.

Ce document-ci, lui, a été établi en **lisant les 65 pages en image** — donc sur
ce qui est réellement visible, et non sur la couche texte.
