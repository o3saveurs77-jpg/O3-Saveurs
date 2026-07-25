# Ô 3 Saveurs — Chez Laila

Site de commande à domicile (livraison + à emporter) pour un restaurant de **cuisine du monde**
(Afrique de l'Ouest · Maghreb · Asie) à Lognes.

**Stack** : Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 6 ·
**PostgreSQL (Neon)** · NextAuth v5 · Stripe Checkout · Resend · Vercel Blob · Recharts · Vitest.

| Document | Contenu |
| --- | --- |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | **À lire avant d'écrire du code** — conventions, montants en centimes, autorisation, validation |
| [`ROADMAP.md`](./ROADMAP.md) | Lots fonctionnels 0 à 9, ordre d'exécution |
| [`AUDIT.md`](./AUDIT.md) | Audit du 25/07/2026 — sécurité, logique métier, conformité |
| [`DEPLOY.md`](./DEPLOY.md) | Mise en production pas à pas (Neon, Stripe, Resend, Blob, Vercel) |

---

## Démarrage

Le projet tourne sur **PostgreSQL**, y compris en développement — le plus simple est une branche
de développement Neon, gratuite. Il n'y a plus de base SQLite locale.

```bash
npm install

# 1. Renseigner .env (copier .env.example) — au minimum :
#    DATABASE_URL, DIRECT_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
cp .env.example .env

# 2. Créer le schéma
npm run db:deploy       # applique les migrations (ou `db:migrate` en dev)

# 3. Peupler le catalogue — idempotent, ne supprime jamais rien
npm run db:seed

# 4. Jeu de démonstration (commandes, livreurs, promotions) — DÉVELOPPEMENT SEULEMENT
npm run db:seed:demo

npm run dev             # http://localhost:3000
```

`AUTH_SECRET` se génère avec `openssl rand -base64 32`. `ADMIN_PASSWORD` doit faire **au moins
12 caractères** : le seed refuse de s'exécuter sinon, car ce compte donne accès à l'intégralité du
fichier clients et de la comptabilité.

### Scripts

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build et lancement production |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` / `test:watch` / `test:cov` | Tests Vitest |
| `npm run db:migrate` | Crée et applique une migration (développement) |
| `npm run db:deploy` | Applique les migrations existantes (production) |
| `npm run db:seed` | Catalogue, zones, horaires, réglages, admin — **idempotent** |
| `npm run db:seed:demo` | Jeu de démonstration ; `-- --purge` pour le retirer |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Réinitialise la base (destructif, développement uniquement) |

> `db:push` a été retiré volontairement : il crée une dérive entre le schéma et les migrations.

### Comptes

- **Admin** : `ADMIN_EMAIL` / `ADMIN_PASSWORD` de `.env`, créés par `db:seed`. Back-office sur `/admin`.
- **Client de démonstration** : `awa.diallo@email.com` / `demo1234`, créé par `db:seed:demo`.

Il n'y a **pas** de création de compte à la volée : l'inscription passe par `/compte`.

---

## Architecture

```
app/
  page.tsx                 Accueil (hero, zones, plat du jour, incontournables)
  carte/                   La Carte (recherche, filtres, options, allergènes)
  commander/               Tunnel de commande
  commande/[id]/           Confirmation et suivi (lecture seule)
  facture/[id]/            Facture conforme (Server Component autorisé)
  compte/                  Espace client (commandes, factures, adresses, favoris, réclamations)
  admin/                   Back-office
  mentions-legales/ cgv/ confidentialite/ allergenes/
  api/                     Route Handlers
components/
  providers/               Contextes : Auth, Dishes, Orders
  cart/                    Panier (Context + localStorage + tiroir)
  admin/                   Écrans du back-office
lib/
  money.ts                 Centimes, formatage, ventilation TVA
  pricing.ts               Calcul serveur d'une commande (prix, zone, remise)
  guard.ts                 Autorisation des routes API
  validate.ts              Validation des entrées, échappement HTML
  stock.ts                 Réservation et mouvements de stock
  hours.ts                 Horaires et créneaux (pur, testé)
  zones.ts                 Zone depuis code postal ou commune (pur, testé)
  settings.ts              Réglages éditables depuis l'admin
  email.ts                 Emails transactionnels (Resend), idempotents
  serialize.ts             Mappage lignes Prisma ↔ types du domaine
  ref.ts                   Références de commande, numérotation de facture
prisma/
  schema.prisma            21 modèles
  seed.ts                  Catalogue (idempotent)
  seed-demo.ts             Démonstration (refuse la production)
tests/                     Vitest
_maquettes/                Maquettes pré-Next, hors build et hors dépôt
```

### Deux règles qui structurent tout le code

**1. Aucun montant ne vient du navigateur.** Le client envoie ce qu'il commande (`dishId`, `qty`,
options, formule) et où il veut être livré. Le serveur relit les prix en base, déduit la zone du
code postal, applique la promotion et calcule le total — voir [`lib/pricing.ts`](./lib/pricing.ts).
Tous les montants sont des **entiers de centimes**.

**2. Chaque route API vérifie son appelant.** Le middleware ne protège que les *pages* `/admin`.
Les Route Handlers appellent `requireAdmin()` / `requireUser()` de [`lib/guard.ts`](./lib/guard.ts).

Le détail est dans [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Flux de données

Catalogue, commandes, zones, promotions, stocks, comptes et réglages sont persistés en base et
servis par `/api/*`. La base est la **seule source de vérité** : `lib/menu.ts` ne contient que les
types applicatifs et le jeu de données de seed. Le panier reste côté client (`localStorage`) mais
n'est jamais cru sur les prix.

---

## État

`npm run typecheck`, `npm test` et `npm run build` passent. Le projet n'a **pas encore été testé
en runtime réel** : il attend les vraies clés Neon, Stripe, Resend et Vercel Blob.

Avant toute mise en ligne commerciale, il reste à obtenir de la cliente ses informations légales
(SIRET, forme juridique, numéro de TVA, régime de TVA réel à confirmer avec son comptable) et la
saisie des allergènes plat par plat. Le détail est au §10 de [`AUDIT.md`](./AUDIT.md).

---

*Développé par Magar Développement — M. Andrys MAGAR.*
