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
   npm run db:seed     # catalogue, zones, horaires, réglages, compte admin
   ```
   Le seed crée l'admin défini par `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Il **refuse
   de s'exécuter** si le mot de passe fait moins de 12 caractères.

> **`db:seed` est idempotent et ne supprime rien** : il peut être relancé sans
> risque. En revanche `npm run db:seed:demo` crée des commandes fictives et
> **refuse de tourner avec `NODE_ENV=production`** — ne l'exécutez jamais sur la
> base du restaurant : ces commandes seraient indistinguables des vraies dans sa
> comptabilité.
>
> N'utilisez pas `prisma db push` : il crée une dérive entre le schéma et les
> migrations. Le script a été retiré du `package.json`.

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
   - Aucune clé publique n'est nécessaire : le paiement passe par Stripe Checkout
     **hébergé**, le client est redirigé vers une page Stripe.
2. Webhook (après le 1er déploiement Vercel) : **Developers → Webhooks → Add endpoint**
   - URL : `https://VOTRE-DOMAINE/api/webhooks/stripe`
   - Événements à cocher — **les cinq**, pas seulement le premier :
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.expired`
     - `checkout.session.async_payment_failed`
     - `charge.refunded`
   - Copier le **Signing secret** `whsec_…` → `STRIPE_WEBHOOK_SECRET`
3. Le webhook vérifie la signature, **compare le montant encaissé au total
   calculé en base**, puis marque la commande payée, attribue son numéro de
   facture séquentiel et envoie les emails. Les sessions expirées ou échouées
   annulent la commande et **remettent les articles en stock**.
4. Cartes de test : `4242 4242 4242 4242`, date future, CVC quelconque.

> **En production, `STRIPE_SECRET_KEY` est obligatoire.** Si elle est absente, la
> route de paiement renvoie une 503 au lieu de laisser passer la commande. Le mode
> « démo » qui marquait les commandes payées sans encaissement n'existe plus
> qu'en développement : une clé oubliée rendait auparavant toutes les commandes
> gratuites, silencieusement.

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
   (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_*`,
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`,
   `RESEND_*`, `RESTAURANT_NOTIFY_EMAIL`).
4. **Build Command** : laisser la valeur par défaut, mais vérifier que l'installation
   utilise **`npm ci`** et non `npm install` — `next-auth` est en version beta et un
   `install` peut installer une beta plus récente qui casse l'authentification.
5. **Deploy.** Après le 1er déploiement : créer le webhook Stripe (étape 3) avec
   l'URL réelle, ajouter `STRIPE_WEBHOOK_SECRET`, puis **Redeploy**.
6. Appliquer les migrations sur la base de prod, **une seule fois**, depuis une
   machine dont le `.env` pointe sur les URLs de production :
   `npm run db:deploy && npm run db:seed`. Ne jamais lancer `db:seed:demo`.

---

## Récap des variables d'environnement

Cette liste correspond exactement aux `process.env.*` réellement lus par le code.

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Postgres Neon (pooled / direct) |
| `AUTH_SECRET` | Signature des sessions NextAuth |
| `NEXTAUTH_URL` | URL publique du site (liens des emails, retours Stripe) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte back-office créé au seed (12 caractères minimum) |
| `STRIPE_SECRET_KEY` | Clé serveur Stripe — **obligatoire en production** |
| `STRIPE_WEBHOOK_SECRET` | Vérification de la signature du webhook |
| `BLOB_READ_WRITE_TOKEN` | Upload des photos (Vercel Blob) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Envoi des emails |
| `RESTAURANT_NOTIFY_EMAIL` | Copie des commandes au restaurant |

## Comptes après seed

- **Admin** : `ADMIN_EMAIL` / `ADMIN_PASSWORD` tels que définis dans l'environnement.
  Aucune valeur par défaut n'est fournie et aucun mot de passe n'est documenté ici :
  un identifiant d'administration écrit dans un fichier du dépôt est un compte ouvert
  sur tout le fichier clients.
- **Client de démonstration** (développement seulement, via `db:seed:demo`) :
  `awa.diallo@email.com` / `demo1234`.

---

## 7. Après la mise en production

Ces points n'étaient pas couverts et laissaient le site sans filet.

**Surveillance.** La route `/api/health` vérifie la base et les intégrations et
renvoie 503 si la base ne répond pas. Branchez-la sur un moniteur gratuit
(BetterStack, UptimeRobot) avec une alerte par email ou SMS.

**Journalisation.** Les logs Vercel en offre Hobby ne sont conservés **qu'une
heure** : un paiement échoué la nuit est invisible au matin. Installez
`@sentry/nextjs` (offre gratuite suffisante ici) pour conserver les erreurs et
être alerté.

**Sauvegardes.** Le plan Neon gratuit n'offre que 24 h d'historique, ce qui est
insuffisant pour de la comptabilité : les factures doivent être conservées 10 ans
(art. L123-22 du code de commerce). Passez au plan payant, ou planifiez un
`pg_dump` régulier vers un stockage externe.

**Rétention des données.** Le RGPD impose une limitation de conservation
(art. 5.1.e). Prévoyez une purge ou une anonymisation des données clients
au-delà de la durée nécessaire, en conservant les pièces comptables.

**Retour arrière.** Vercel garde les déploiements précédents : en cas de
régression, **Deployments → … → Promote to Production** sur le dernier
déploiement sain. Attention : un retour arrière du code ne défait pas une
migration de base — testez toujours les migrations sur une branche Neon d'abord.

**Avant d'encaisser le premier euro.** Les informations légales de la cliente
(SIRET, forme juridique, numéro de TVA) doivent être renseignées dans
**Admin → Réglages**, sinon les factures et les mentions légales sont
incomplètes. Le régime de TVA réel est à confirmer avec son comptable. Voir §5 de
[`AUDIT.md`](./AUDIT.md).
