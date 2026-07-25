# Ô 3 Saveurs — Chez Laila

> **Cuisine du monde** · Site de commande à domicile (livraison + à emporter)
> Document de spécifications à intégrer dans Claude Design.

---

## 1. Contexte & objectif

Créer un **site web complet de commande à domicile** (pas de service sur place) pour le restaurant **Ô 3 Saveurs — Chez Laila**, proposant une cuisine du monde : **asiatique, maghrébine et africaine**.

Le site doit permettre au client de commander en ligne (livraison ou à emporter), de payer, et de suivre sa commande. Il comprend deux espaces back-office : un **dashboard client** et un **dashboard admin**.

### Stack technique

- **Frontend / Fullstack** : Next.js 15 (App Router), React 19, TypeScript
- **Base de données** : Prisma + PostgreSQL
- **Auth** : Auth0
- **Paiement** : Stripe
- **Emails / factures** : Resend
- **Hébergement** : Vercel (ou Clever Cloud)
- **Graphiques** : Recharts

---

## 2. Identité visuelle

Ambiance **chaleureuse et métissée** reflétant la « cuisine du monde » (Asie + Maghreb + Afrique). Reprise de la charte du dépliant existant.

| Rôle | Couleur | Hex |
|------|---------|-----|
| Fond principal | Terracotta / orange | `#E8732A` |
| Titres de sections | Rouge brique | `#A6243A` |
| Accents | Turquoise | `#1FA89A` |
| Highlights / prix | Jaune doré | `#F2B705` |
| Cartes / texte clair | Crème | `#FBEFD8` |

- **Typo** : script chaleureux pour les titres de catégories, sans-serif lisible pour le corps.
- **Motifs** : éléments géométriques ethniques (zigzags, soleils, spirales) en décor discret.
- **Photos** : gros plans appétissants des plats (assets fournis, voir §8).
- **Ton** : convivial, authentique, gourmand.

---

## 3. La carte

> Items marqués `À DÉFINIR` = prix ou disponibilité à confirmer avec la cliente.
> Ils doivent apparaître dans l'admin mais peuvent être masqués côté client tant que non validés.

### 3.1 Saveurs asiatiques
| Plat | Prix |
|------|------|
| Loc Lac bœuf | 12,00 € |
| Bo Bun | `À DÉFINIR` |
| Nouilles sautées | `À DÉFINIR` |

### 3.2 Saveur du Maghreb
| Plat | Prix |
|------|------|
| Tajine veau / pruneaux | 13,00 € |
| Tajine agneau / petit pois / pommes de terre / carotte | 13,90 € |
| Tajine poulet / olive / frite maison | 12,00 € |
| Couscous | `À DÉFINIR` (à réfléchir — plat du jour vendredi) |

### 3.3 Saveur Africaine
| Plat | Prix |
|------|------|
| Tcheb poulet | 11,00 € |
| Tcheb bœuf | 12,00 € |
| Tcheb poisson | 13,00 € |
| Yassa poulet | 11,00 € |
| Yassa bœuf | 12,00 € |
| Mafé bœuf | 12,00 € |
| Mafé poulet | 11,00 € |
| Athiéké poisson | 13,00 € |

### 3.4 Sandwich Baguette
*Sauce au choix : mayonnaise maison ou piment maison.*
| Sandwich | Prix |
|----------|------|
| Banh Mi (bœuf / poulet / carotte / concombre) | 6,50 € |
| Brochette poulet | 7,00 € |
| Brochette brebis | 7,00 € |
| Brochette d'agneau | `À DÉFINIR` |

### 3.5 Grillades
*Servies avec 1 accompagnement au choix (voir §3.6).*
| Plat | Prix |
|------|------|
| Brochette poulet / brebis (3) | 12,00 € |
| Poisson dorade entière | 16,00 € |
| Poulet braisé | 12,00 € |

### 3.6 Accompagnements
| Accompagnement | Prix |
|----------------|------|
| Riz blanc | 2,99 € |
| Alloco | 3,99 € |
| Riz rouge | 3,99 € |
| Tcheb blanc | 3,99 € |
| Pastel thon / viande hachée (4 pièces) | 6,00 € |
| Pastel V.H. cheddar (4 pièces) | 7,00 € |
| Frite maison | 3,99 € |
| Salade composée | 3,99 € |
| Patate fourrée | 3,99 € |
| Piment frais | 0,50 € |

### 3.7 Boissons maison
| Boisson | Prix |
|---------|------|
| Jus de gingembre (33 cl) | 3,50 € |
| Jus de bissap (33 cl) | 3,50 € |
| Jus d'avocat (à la commande) | `À DÉFINIR` |
| Jus d'orange | `À DÉFINIR` |

### 3.8 Desserts
| Dessert | Prix |
|---------|------|
| Degué (portion) | 3,50 € |
| Ananas frais | 3,50 € |
| Fondant chocolat | 4,00 € |
| Panacotta (coulis mangue / fruits rouges / passion) | 4,00 € |
| Mousse au chocolat | 4,00 € |

### 3.9 Plats du jour (récurrents)
À afficher dans un encart « Plat du jour » sur l'accueil et la carte, activable par jour depuis l'admin.
| Jour | Plat | Statut |
|------|------|--------|
| Mercredi | Sardines | `À DÉFINIR` (prix) |
| Jeudi | Paella | `À DÉFINIR` (à réfléchir) |
| Vendredi | Couscous | `À DÉFINIR` (au pire) |

---

## 4. Site vitrine public

- **Accueil** : hero avec photo « tablée » (plusieurs plats), nom **Ô 3 Saveurs — Chez Laila**, slogan *« Cuisine du monde »*, CTA « Commander ». Encart **Plat du jour** dynamique.
- **Vérification de zone de livraison** dès l'arrivée : saisie du code postal → si dans la zone, afficher frais de livraison + minimum de commande ; si hors zone, message explicite.
- **Page Carte** : toutes les sections du §3, organisées par catégorie. Chaque plat affiche :
  - photo, nom, description, prix
  - badge **disponible / épuisé**
  - gestion des **options** (riz rouge / blanc, sauce mayo / piment, choix d'accompagnement pour les grillades) et **suppléments**
  - bouton « Ajouter au panier »
- **Panier + tunnel de commande** : choix **livraison** ou **à emporter**, créneau (« au plus vite » ou horaire), récapitulatif avec frais de livraison et minimum de commande.
- **Pages** : À propos / L'histoire de Chez Laila, Contact (formulaire + carte + horaires).
- **Responsive** mobile-first (la majorité des commandes se fait au téléphone).

---

## 5. Paiement

- Intégration **Stripe** : carte bancaire, Apple Pay, Google Pay.
- Calcul automatique des **frais de livraison** selon la zone + contrôle du **minimum de commande**.
- Génération automatique d'une **facture PDF** envoyée par email via **Resend** après paiement.

---

## 6. Dashboard CLIENT

- Connexion / inscription via **Auth0**.
- **Historique des commandes** avec statut.
- **Suivi de livraison en temps réel** : Confirmée → En cuisine → En route → Livrée.
- **Téléchargement des factures** (PDF).
- **Adresses enregistrées**, favoris, profil.

---

## 7. Dashboard ADMIN

- **Vue d'ensemble** avec graphiques (Recharts) :
  - CA par jour / semaine / mois
  - Commandes par statut
  - Plats les plus vendus
  - Panier moyen
  - Taux de livraison / délais
- **Gestion des plats** : CRUD complet par catégorie (photo, prix, description, options, stock, disponibilité, mise en avant). Permet d'activer/désactiver les items `À DÉFINIR` et les **plats du jour**.
- **Gestion des commandes** en temps réel : changement de statut, impression du ticket.
- **Gestion des livraisons et des livreurs** : affectation, suivi.
- **Facturation** : historique et export.
- **Gestion clients** et **zones de livraison** (codes postaux couverts, frais, minimum de commande).

---

## 8. Assets fournis

Photos de plats disponibles (à associer aux bons items dans l'admin) : tajines, tcheb, yassa, mafé, brochettes poulet/bœuf, poulet braisé, alloco, riz rouge/blanc, degué, ananas frais, jus de gingembre, tablées d'ambiance. Voir dossier d'images joint.

---

## 9. Ordre de génération souhaité

1. **Site vitrine** : accueil + page Carte complète (toutes les sections du §3, avec options et badges).
2. **Dashboard client**.
3. **Dashboard admin**.

> Design fidèle à la charte §2 (terracotta, motifs ethniques, ambiance chaleureuse « cuisine du monde »).

---

## 10. Points à valider avec la cliente

- [ ] Prix : Bo Bun, Nouilles sautées, Brochette d'agneau, Jus d'avocat, Jus d'orange
- [ ] Plats du jour : confirmer Couscous (vendredi), Paella (jeudi), Sardines (mercredi) + leurs prix
- [ ] Zone(s) de livraison, frais et minimum de commande
- [ ] Horaires d'ouverture / créneaux de livraison
- [ ] Logo définitif et coordonnées (adresse, téléphone) pour le pied de page

---

*Magar Développement — M. Andrys MAGAR · Auto-entrepreneur*
*SIRET 908 058 092 00028 · Garges-lès-Gonesse, Île-de-France*
*Tél. 06 41 59 86 88 · andrys.developper@gmail.com · magar-developpement.fr*
*TVA non applicable, art. 293 B du CGI*
