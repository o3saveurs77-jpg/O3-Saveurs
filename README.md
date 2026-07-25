# Ô 3 Saveurs — Chez Laila

Site de commande à domicile (livraison + à emporter) pour un restaurant de **cuisine du monde**
(Afrique de l'Ouest · Maghreb · Asie) à Lognes.

**Stack** : Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma · SQLite
(→ PostgreSQL en prod) · Recharts · Vitest.

> 📋 Voir [`PROJECT-PLAN.md`](./PROJECT-PLAN.md) pour la liste exhaustive des fonctionnalités et leur statut.

---

## 🚀 Démarrage

```bash
npm install
npm run db:migrate      # crée la base SQLite (prisma/dev.db)
npm run db:seed         # remplit catalogue, zones, plats du jour, commandes & comptes démo
npm run dev             # http://localhost:3000
```

> La connexion DB est dans `.env` (`DATABASE_URL="file:./dev.db"`). Pour les intégrations
> externes (Auth0, Stripe, Resend), copier `.env.example` → `.env.local` et renseigner les clés.

### Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build & lancement production |
| `npm test` / `test:watch` | Tests Vitest |
| `npm run db:seed` | (Re)peuple la base de démo |
| `npm run db:studio` | Prisma Studio (explorateur de données) |
| `npm run db:reset` | Réinitialise la base + re-seed |

### Comptes de démo
- **Client** : se connecter via `/compte` (email `awa.diallo@email.com`, ou n'importe quel email — le compte est créé à la volée).
- **Admin** : back-office accessible sur `/admin`.

---

## 🗂️ Architecture

```
app/
  page.tsx                 Accueil (hero, zones, plat du jour, incontournables)
  carte/                   La Carte (recherche, filtres, options, badges)
  commander/               Tunnel de commande
  commande/[id]/           Confirmation + suivi temps réel
  facture/[id]/            Facture imprimable (PDF navigateur)
  compte/                  Espace client (commandes, factures, adresses, favoris, profil)
  admin/                   Back-office (vue d'ensemble, commandes, plats, livraisons, clients, zones, facturation)
  api/                     Route Handlers : dishes, orders, zones, auth
components/
  providers/               Contextes : Auth, Orders, Dishes (branchés sur l'API)
  cart/                    Panier (Context + localStorage + tiroir)
  admin/                   Écrans du back-office
lib/
  menu.ts                  Catalogue source (seed) + helpers
  prisma.ts                Client Prisma (singleton)
  serialize.ts             Mappage lignes DB ↔ types du domaine
  analytics.ts             Agrégations du dashboard (testé)
  zones.ts                 Matching ville → zone (testé)
prisma/
  schema.prisma            Modèle de données
  seed.ts                  Script de seed
tests/                     Vitest (logique métier + composant)
```

### Flux de données
Le catalogue, les commandes, les zones et les comptes sont **persistés en base** via les
Route Handlers `/api/*`. Les contextes React (`DishesContext`, `OrdersContext`, `AuthContext`)
chargent les données depuis l'API et écrivent les mutations (création de commande, changement de
statut, CRUD plats, favoris…). Le panier reste côté client (localStorage).

---

## 🔌 Passage en production (intégrations)
Tout est structuré et branchable dès que les clés sont disponibles (voir `.env.example`) :
- **PostgreSQL** : passer `provider = "postgresql"` dans `schema.prisma` + `DATABASE_URL` → `prisma migrate deploy`.
- **Auth0** : remplacer la session cookie de `app/api/auth/*` + `AuthContext`.
- **Stripe** : brancher le paiement réel dans le tunnel + webhook (commande créée dans `POST /api/orders`).
- **Resend** : envoi email de confirmation + facture PDF (point `TODO` dans `POST /api/orders`).

---

*Magar Développement — M. Andrys MAGAR · SIRET 908 058 092 00028 · TVA non applicable, art. 293 B du CGI.*
