# Déploiement — Ô 3 Saveurs (Neon + Vercel)

Guide pas à pas pour mettre le site en production. Le code est déjà branché sur
tous ces services ; il ne reste qu'à créer les comptes et renseigner les clés.

---

## 1. Base de données — Neon (PostgreSQL)

1. Créer un compte sur https://neon.tech → **New Project** (région Europe, ex. Frankfurt).
2. Dans **Connection Details**, copier les **deux** URLs :
   - **Pooled** (contient `-pooler`) → `DATABASE_URL`
   - **Direct** (sans `-pooler`) → `DIRECT_URL`
3. Les coller dans `.env` (local) et dans Vercel (étape 5).
4. Appliquer le schéma et charger les données de départ :
   ```bash
   npm run db:deploy   # crée les tables (prisma migrate deploy)
   npm run db:seed     # catalogue, zones, plats du jour, comptes démo
   ```
   Le seed crée l'admin défini par `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 2. Authentification — NextAuth

- Générer un secret : `npx auth secret` (ou `openssl rand -base64 32`) → `AUTH_SECRET`.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` : identifiants du back-office (créés au seed).
- `NEXTAUTH_URL` : l'URL publique en prod (Vercel la fournit automatiquement,
  mais on peut la fixer, ex. `https://o3saveurs.vercel.app`).
- Le back-office `/admin` est protégé par le middleware : seul un compte de rôle
  `ADMIN` y accède ; les autres sont redirigés vers `/compte`.

## 3. Paiement — Stripe

1. Compte sur https://stripe.com → **Developers → API keys** :
   - `sk_test_…` → `STRIPE_SECRET_KEY`
   - `pk_test_…` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
2. Webhook (après le 1er déploiement Vercel) : **Developers → Webhooks → Add endpoint**
   - URL : `https://VOTRE-DOMAINE/api/webhooks/stripe`
   - Événement : `checkout.session.completed`
   - Copier le **Signing secret** `whsec_…` → `STRIPE_WEBHOOK_SECRET`
3. Le paiement carte / Apple Pay / Google Pay passe par **Stripe Checkout** (page
   hébergée). Le webhook marque la commande `paid` et déclenche l'email.
4. Cartes de test : `4242 4242 4242 4242`, date future, CVC quelconque.

> Tant que `STRIPE_SECRET_KEY` reste un placeholder, le tunnel fonctionne en mode
> « démo » : la commande est créée et marquée payée sans passer par Stripe.

## 4. Photos — Vercel Blob

1. Dans le projet Vercel : **Storage → Create → Blob**.
2. Copier le token `vercel_blob_rw_…` → `BLOB_READ_WRITE_TOKEN`.
3. L'admin **Plats** propose « Téléverser une photo » → upload vers Blob → URL
   stockée dans la fiche plat. (`next.config.mjs` autorise déjà le domaine Blob.)

## 5. Emails — Resend

1. Compte sur https://resend.com → **API Keys** → `re_…` → `RESEND_API_KEY`.
2. Vérifier un domaine d'envoi, puis renseigner `RESEND_FROM_EMAIL`
   (ex. `commandes@o3saveurs.fr`) et `RESTAURANT_NOTIFY_EMAIL` (copie restaurant).
3. À chaque commande confirmée : email client + notification restaurant.

## 6. Déploiement Vercel

1. Pousser le repo sur GitHub, puis **Import Project** sur https://vercel.com.
2. **Framework : Next.js** (détecté). Aucune config spéciale : le build lance
   `prisma generate && next build`.
3. **Settings → Environment Variables** : coller toutes les clés du `.env`
   (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `ADMIN_*`, `STRIPE_*`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `RESEND_*`,
   `RESTAURANT_NOTIFY_EMAIL`).
4. **Deploy.** Après le 1er déploiement : créer le webhook Stripe (étape 3) avec
   l'URL réelle, ajouter `STRIPE_WEBHOOK_SECRET`, puis **Redeploy**.
5. Appliquer les migrations sur la base de prod une fois (depuis la machine avec
   les URLs de prod dans `.env`) : `npm run db:deploy && npm run db:seed`.

---

## Récap des variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Postgres Neon (pooled / direct) |
| `AUTH_SECRET` | Signature des sessions NextAuth |
| `NEXTAUTH_URL` | URL publique du site |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte back-office (seed) |
| `STRIPE_SECRET_KEY` | Clé serveur Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe |
| `STRIPE_WEBHOOK_SECRET` | Vérification du webhook |
| `BLOB_READ_WRITE_TOKEN` | Upload photos (Vercel Blob) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Envoi des emails |
| `RESTAURANT_NOTIFY_EMAIL` | Copie des commandes au restaurant |

## Comptes de démonstration (après seed)

- **Admin** : `ADMIN_EMAIL` / `ADMIN_PASSWORD` (par défaut `laila@o3saveurs.fr` / `admin1234`)
- **Client démo** : `awa.diallo@email.com` / `demo1234`
