# Ô 3 Saveurs — Chez Laila · Plan du projet & suivi

> Site de commande à domicile (livraison + à emporter) — cuisine du monde.
> Stack : Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma · Recharts.
> État au 2026-06-08.

Légende : ✅ fait · 🟡 partiel / mock · ⛔ bloqué (clé externe) · ⬜ à faire

---

## 1. Site vitrine public
- ✅ Accueil : hero, slogan, CTA Commander, décor ethnique
- ✅ Vérification de zone de livraison (code postal/ville → frais + minimum)
- ✅ Encart « Plat du jour » dynamique (selon le jour)
- ✅ Trio des saveurs (Afrique / Maghreb / Asie)
- ✅ Incontournables, formules, zones, à propos
- ✅ Page Carte : 10 catégories, recherche, filtres (Tout/Populaires/Healthy)
- ✅ Carte plat : photo, nom, desc, prix, badges (Populaire/Healthy/Nouveau/Bientôt/Épuisé)
- ✅ Options & suppléments (riz, sauce, formules sandwich) via modale
- ✅ Bouton « Ajouter au panier » + favoris ♥
- ✅ Pages À propos & Contact (formulaire — envoi Resend à brancher)
- ✅ Responsive mobile-first (vérifié, viewport OK)

## 2. Panier & commande
- ✅ Panier (tiroir, quantités, persistance)
- ✅ Tunnel : mode livraison/à emporter, zone, créneau, coordonnées
- ✅ Récap avec frais de livraison + contrôle du minimum de commande
- ✅ Confirmation + suivi temps réel (Confirmée → En cuisine → En route → Livrée)
- 🟡 Paiement (UI Apple/Google/CB) — **simulé** (Stripe à brancher)

## 3. Paiement (Stripe)
- ⛔ PaymentIntent / Checkout réel (besoin `STRIPE_SECRET_KEY`)
- ⛔ Apple Pay / Google Pay réels
- ✅ Calcul frais de livraison + minimum (logique en place)
- 🟡 Facture PDF : génération **imprimable navigateur** (envoi auto Resend ⛔)

## 4. Espace client
- ✅ Connexion / inscription — **session cookie réelle (DB)**, Auth0 à brancher
- ✅ Historique des commandes avec statut
- ✅ Suivi de livraison temps réel
- ✅ Téléchargement des factures (PDF via impression)
- ✅ Adresses enregistrées, favoris, profil

## 5. Back-office admin
- ✅ Vue d'ensemble Recharts : CA jour/semaine, commandes/statut, top plats, panier moyen, taux de livraison
- ✅ Gestion des plats : CRUD complet (prix, dispo, mise en avant, badge, photo, catégorie)
- ✅ Gestion des commandes temps réel : changement de statut, ticket
- ✅ Livraisons & livreurs : affectation, suivi
- ✅ Facturation : historique + export CSV
- ✅ Clients (agrégés)
- ✅ Zones de livraison (frais, minimum, communes)

## 6. Plateforme technique
- ✅ Design system (charte §2 : terracotta/brick/teal/gold, motifs)
- ✅ **Base de données SQLite via Prisma** (dynamique, persistant serveur) — Postgres = changer provider
- ✅ **API Route Handlers** : dishes, orders, zones, auth
- ✅ Données initiales via **seed** (catalogue, zones, plats du jour, démo)
- ✅ **Tests** : Vitest (logique métier, API, util)
- ⛔ Auth0 (besoin clés) — auth session cookie en attendant
- ⛔ Stripe (besoin clés) — paiement simulé
- ⛔ Resend (besoin clé) — emails/factures
- ⬜ Déploiement Vercel/Clever Cloud (quand prod prête)

---

## Reste à faire pour la mise en production (avec la cliente)
1. Fournir les clés : PostgreSQL, Auth0, Stripe, Resend → brancher (structure prête, voir `.env.example`).
2. Points §10 spec : prix « À définir » (Bo Bun, Nouilles, Brochette agneau, Jus avocat/orange), plats du jour & prix, zones/frais/min réels, horaires, logo & coordonnées définitifs.
3. Photos restantes à associer aux plats sans visuel.
4. Mentions légales / CGV / RGPD (cookies, données).
5. Déploiement + nom de domaine.
