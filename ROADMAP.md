# Feuille de route — Ô 3 Saveurs

Objectif : passer d'un site vitrine + maquette de back-office à une **plateforme de commande complète et dynamique**, où Laila pilote tout depuis l'admin sans qu'aucune donnée ne soit codée en dur.

Établie le 25 juillet 2026, à la suite de [AUDIT.md](AUDIT.md). Les numéros de lot servent de référence dans les commits.

---

## Principe directeur

Aujourd'hui, une partie du site lit `lib/menu.ts` (données en dur) et une autre la base. Tout ce qui suit part du même principe : **la base est la seule source de vérité, `lib/menu.ts` devient uniquement le jeu de données de seed initial**, et chaque chose que Laila doit pouvoir changer a son écran d'administration.

Second principe : **plus jamais un montant calculé par le navigateur**. Tous les prix, remises, frais et totaux sont recalculés côté serveur depuis la base, en centimes entiers.

---

## Lot 0 — Fondations (prérequis absolu)

Rien d'autre ne peut être construit proprement avant.

| # | Sujet | Détail |
| --- | --- | --- |
| 0.1 | Versionnement | `.gitignore` complété, `git init`, premier commit, dépôt privé |
| 0.2 | Montants en centimes | `Int` partout, `lib/money.ts` (conversion, formatage, TVA), migration |
| 0.3 | Garde d'autorisation | `lib/guard.ts` : `requireAdmin()`, `requireUser()`, appliqué aux 11 routes |
| 0.4 | Calcul serveur | `lib/pricing.ts` : `computeOrder()` — prix depuis `Dish`, frais depuis `Zone`, remise depuis `Promotion` |
| 0.5 | Réglages dynamiques | Modèle `Setting` (clé/valeur) + `lib/settings.ts` : coordonnées, SIRET, TVA, seuils, textes |
| 0.6 | Validation d'entrée | Schémas de validation sur toutes les frontières API |

## Lot 1 — Catalogue et stocks

Ce que Laila attend en priorité : ne plus vendre ce qu'elle n'a plus.

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 1.1 | **Stock par plat** | `stock` (null = illimité), `stockAlert` (seuil), décrément atomique à la commande, passage automatique en « épuisé » à 0 |
| 1.2 | **Mouvements de stock** | Modèle `StockMovement` : entrée, sortie, correction, perte — avec motif et auteur. Historique consultable |
| 1.3 | **Réapprovisionnement** | Écran « Stocks » : saisie rapide des entrées du matin, remise à zéro en fin de service, alertes en tête de liste |
| 1.4 | **Allergènes** | 14 allergènes réglementaires par plat, saisie en cases à cocher, affichage obligatoire côté client (INCO 1169/2011) |
| 1.5 | **Éditeur de plat complet** | Options, formules, tags, piment, catégorie, photo, ordre — tout éditable (aujourd'hui la moitié des champs est inaccessible) |
| 1.6 | **Réordonnancement** | Glisser-déposer de l'ordre d'affichage, par catégorie |
| 1.7 | **Catégories dynamiques** | Modèle `Category` en base au lieu de la constante |

## Lot 2 — Plats du jour et mises en avant

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 2.1 | **Plat du jour administrable** | Modèle `DailySpecial` relié à un `Dish`, par date **et** par jour de semaine récurrent, prix spécifique optionnel |
| 2.2 | **Affichage dynamique** | L'encart de l'accueil lit la base en rendu dynamique — aujourd'hui il est figé au build et ne s'affiche jamais |
| 2.3 | **Bandeau d'annonce** | Modèle `Announcement` : message, période de diffusion, lien, couleur — pour « Fermé le 15 août », « Nouveau : … » |
| 2.4 | **Encarts publicitaires** | Modèle `Banner` : image, titre, lien, emplacement (accueil, carte, panier), période, ordre. Statistiques de clics |
| 2.5 | **Mise en avant** | « Populaire », « Nouveau », « Coup de cœur » pilotés depuis l'admin, avec période de validité |

## Lot 3 — Promotions et fidélité

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 3.1 | **Codes promo** | Modèle `Promotion` : pourcentage, montant fixe, ou livraison offerte. Minimum de commande, période, nombre d'utilisations max, usage unique par client |
| 3.2 | **Application serveur** | Le code est validé et la remise calculée **côté serveur** dans `computeOrder()`, jamais dans le navigateur |
| 3.3 | **Promotions automatiques** | Sans code : « -10 % le mardi », « livraison offerte au-dessus de 40 € », « 2e plat à -50 % » |
| 3.4 | **Écran admin Promotions** | Création, activation, suivi du nombre d'utilisations et du CA généré |
| 3.5 | **Fidélité** | Compteur de commandes par client, palier déclenchant une remise automatique |

## Lot 4 — Distribution et livraison

C'est le lot le plus structurant côté exploitation.

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 4.1 | **Livreurs réels** | Modèle `Driver` : nom, téléphone, actif, véhicule. Remplace la liste fictive codée en dur (Samir, Kevin, Dramane, Élodie) |
| 4.2 | **Tournées** | Modèle `DeliveryRun` : un livreur, un créneau, plusieurs commandes ordonnées. Affectation par glisser-déposer |
| 4.3 | **Zones en base** | Le checkout lit les zones depuis la base — aujourd'hui l'écran admin Zones ne change rien pour le client |
| 4.4 | **Zone déduite du code postal** | Colonne `zips` sur `Zone`, zone calculée côté serveur, refus hors zone. Le client ne choisit plus sa propre zone tarifaire |
| 4.5 | **Créneaux et horaires** | Modèle `OpeningHours` + `lib/hours.ts` : créneaux réels selon le jour, refus des commandes hors service, capacité maximale par créneau |
| 4.6 | **Statuts pilotés par l'admin** | Suppression de l'auto-avancement par le navigateur du client ; transitions réservées à l'admin, avec horodatage de chaque étape |
| 4.7 | **Suivi client honnête** | Page de suivi en lecture seule, rafraîchissement périodique, heure estimée |
| 4.8 | **Ticket de cuisine** | Impression réelle du seul ticket (feuille de style dédiée) — aujourd'hui le bouton imprime toute la page d'administration |
| 4.9 | **Vue Cuisine** | Écran plein écran des commandes à préparer, par créneau, avec minuteur |

## Lot 5 — Tableau de bord

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 5.1 | **Agrégation serveur** | Les KPIs sont calculés en base, en `Europe/Paris` — aujourd'hui le CA affiché dépend du fuseau de la machine consultée |
| 5.2 | **CA commandé vs encaissé** | Deux notions distinctes et libellées ; aujourd'hui deux écrans voisins affichent des chiffres contradictoires |
| 5.3 | **Encaissement des espèces** | Bouton « Encaissé » sur les commandes en espèces — aujourd'hui aucun moyen de les marquer payées, tout ce CA est invisible |
| 5.4 | **Indicateurs** | CA du jour / semaine / mois, panier moyen, nombre de commandes, taux d'annulation, top plats, répartition par zone, heures de pointe, marge si les coûts sont saisis |
| 5.5 | **Comparaison** | Évolution vs période précédente, objectif mensuel |
| 5.6 | **Alertes** | Stocks bas, commandes impayées, commandes en retard, paniers abandonnés |
| 5.7 | **Exports** | CSV et PDF des commandes et du CA sur une période, pour le comptable |

## Lot 6 — Emails et newsletter

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 6.1 | **Emails transactionnels** | Confirmation, paiement reçu, commande en préparation, en route, livrée, annulée, facture. Templates avec échappement HTML (aujourd'hui injectable) |
| 6.2 | **Idempotence** | Un seul email par événement, même si Stripe rejoue le webhook |
| 6.3 | **Newsletter — inscription** | Modèle `NewsletterSubscriber` : double opt-in par email, jeton de désinscription, formulaire dans le pied de page |
| 6.4 | **Newsletter — campagnes** | Modèle `Campaign` : objet, contenu, audience (tous, clients actifs, inactifs), envoi programmé, statistiques d'ouverture |
| 6.5 | **Éditeur de campagne** | Rédaction dans l'admin, aperçu, envoi test, envoi réel par lots |
| 6.6 | **Relance panier abandonné** | Email automatique après 24 h sur les commandes restées impayées |
| 6.7 | **Désinscription** | Page `/newsletter/desinscription` avec jeton, conforme RGPD |

## Lot 7 — Service après-vente

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 7.1 | **Réclamations** | Modèle `SupportTicket` rattaché à une commande : motif, description, photo, statut |
| 7.2 | **Messagerie** | Modèle `TicketMessage` : fil de discussion client ↔ restaurant, notification par email à chaque réponse |
| 7.3 | **Espace client** | Onglet « Mes réclamations », ouverture depuis une commande livrée |
| 7.4 | **Écran admin SAV** | File de traitement, priorité, temps de réponse, clôture |
| 7.5 | **Gestes commerciaux** | Remboursement partiel via Stripe, ou code promo de dédommagement généré depuis le ticket |
| 7.6 | **Formulaire de contact fonctionnel** | Aujourd'hui le `<form>` n'a ni `onSubmit`, ni `name` sur les champs : tout est à écrire |

## Lot 8 — Conformité et pages légales

Bloquant pour encaisser le premier euro.

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 8.1 | **Mentions légales** | Dénomination, forme juridique, SIRET, n° TVA, hébergeur, responsable de publication (art. 6-III LCEN) |
| 8.2 | **CGV** | Prix, frais, minimum, délais, paiement, **exclusion du droit de rétractation**, médiateur de la consommation, droit applicable |
| 8.3 | **Politique de confidentialité** | Finalités, bases légales, durées, destinataires (Stripe, Resend, Neon, Vercel), droits, CNIL |
| 8.4 | **Acceptation des CGV** | Case non pré-cochée bloquant le paiement (le consentement doit être actif) |
| 8.5 | **Allergènes** | Voir 1.4 — obligation avant conclusion de la commande, avec responsabilité pénale à la clé |
| 8.6 | **Facture conforme** | Numérotation séquentielle, ventilation HT / TVA 10 % / TTC, SIRET, `paid` réellement consulté. Suppression de la mention « TVA non applicable art. 293 B » copiée par erreur |
| 8.7 | **Rétention des données** | Purge ou anonymisation programmée (art. 5.1.e RGPD), conservation des factures 10 ans |
| 8.8 | **Bandeau cookies** | **Seulement si** un traceur tiers est ajouté un jour. Aujourd'hui inutile : aucun tracker, polices auto-hébergées |

## Lot 9 — Qualité, référencement, performance

| # | Fonctionnalité | Ce que ça donne |
| --- | --- | --- |
| 9.1 | **Référencement** | `metadataBase`, Open Graph par page, JSON-LD `Restaurant`, `sitemap.ts`, `robots.ts`, favicon et icônes, `noindex` sur commande et facture |
| 9.2 | **Images** | Migration vers `next/image` avec `sizes` et `priority`, recompression — 5 Mo servis sur `/carte` aujourd'hui |
| 9.3 | **Accessibilité** | Focus et Échap sur les modales et le tiroir, labels associés, palette au contraste conforme, ARIA sur les onglets et filtres |
| 9.4 | **Robustesse** | `error.tsx`, `not-found.tsx`, `loading.tsx`, remplacement des `alert()` |
| 9.5 | **Tests** | Calcul des totaux, autorisation des routes, webhook, cloisonnement des commandes, panier |
| 9.6 | **Outillage** | ESLint réel, CI GitHub Actions, `tsc --noEmit`, `noUncheckedIndexedAccess` |
| 9.7 | **Exploitation** | `/api/health`, Sentry, sauvegardes de base, index Prisma et pagination |

---

## Ordre d'exécution

```
Lot 0  Fondations          ← en cours
Lot 1  Catalogue & stocks  ┐
Lot 2  Plats du jour & pub ├─ dépendent du Lot 0
Lot 3  Promotions          ┤
Lot 4  Distribution        ┘
Lot 5  Tableau de bord     ← dépend des Lots 1 et 4
Lot 6  Emails & newsletter ┐
Lot 7  SAV                 ├─ indépendants entre eux
Lot 8  Conformité          ┘
Lot 9  Qualité & SEO       ← finition continue
```

## Ce qui dépend de la cliente, pas du développement

À demander à Laila en parallèle, car ces éléments sont sur le chemin critique :

- SIRET, forme juridique, n° de TVA, adresse du siège — pour les mentions légales et les factures.
- Régime de TVA réel, à confirmer avec son comptable.
- Les allergènes, plat par plat — une session de saisie à prévoir.
- Prix définitifs, zones et frais de livraison réels, horaires exacts, logo.
- Les écarts de carte relevés au §8 de l'audit : prix inventés, plats substitués, catégorie ajoutée.
