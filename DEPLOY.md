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
   Le seed garantit que `ADMIN_EMAIL` a le rôle `ADMIN` — la connexion se fait
   ensuite via Auth0 (étape 2), sans mot de passe applicatif.

> **`db:seed` est idempotent et ne supprime rien** : il peut être relancé sans
> risque. En revanche `npm run db:seed:demo` crée des commandes fictives et
> **refuse de tourner avec `NODE_ENV=production`** — ne l'exécutez jamais sur la
> base du restaurant : ces commandes seraient indistinguables des vraies dans sa
> comptabilité.
>
> N'utilisez pas `prisma db push` : il crée une dérive entre le schéma et les
> migrations. Le script a été retiré du `package.json`.

## 2. Authentification — NextAuth + Auth0

La connexion passe par **Auth0** (Universal Login hébergé) : plus de mot de passe
géré par l'application elle-même.

1. Générer un secret NextAuth : `npx auth secret` (ou `openssl rand -base64 32`)
   → `AUTH_SECRET`.
2. Sur https://auth0.com, créer une application de type **Regular Web
   Application**.
3. Dans **Application → Basic Information**, copier :
   - **Domain** → `AUTH0_ISSUER` (préfixé par `https://`, sans slash final,
     ex. `https://xxx.eu.auth0.com`)
   - **Client ID** → `AUTH0_CLIENT_ID`
   - **Client Secret** → `AUTH0_CLIENT_SECRET`
4. Toujours dans les réglages de l'application, **Application URIs** :
   - **Allowed Callback URLs** :
     `https://VOTRE-DOMAINE/api/auth/callback/auth0,http://localhost:3000/api/auth/callback/auth0`
   - **Allowed Logout URLs** : `https://VOTRE-DOMAINE,http://localhost:3000`
   - **Allowed Web Origins** : `https://VOTRE-DOMAINE,http://localhost:3000`
   - **Allowed Origins (CORS)** : la même liste que Web Origins
5. `ADMIN_EMAIL` : l'adresse qui doit se connecter (via Auth0) pour obtenir le
   rôle `ADMIN`. Le seed (`npm run db:seed`) crée/maintient ce compte avec ce
   rôle ; toute autre adresse qui se connecte via Auth0 est créée en `CLIENT`.
6. `NEXTAUTH_URL` : l'URL publique en prod (Vercel la fournit automatiquement,
   mais on peut la fixer, ex. `https://o3saveurs.vercel.app`).
7. Le back-office `/admin` est protégé par le middleware : seul un compte de rôle
   `ADMIN` y accède ; les autres sont redirigés vers `/compte`.

> L'inscription (création de compte client) se fait aussi via Auth0 Universal
> Login — aucune route applicative dédiée. Pour activer des connexions sociales
> (Google, etc.), c'est un réglage Auth0 (**Authentication → Social**), sans
> changement de code.

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

## 4bis. Livraison au kilomètre — Google Maps (facultatif)

Par défaut, les frais de livraison sont calculés **par zone de code postal**
(Admin → Zones). Deux adresses d'une même commune sont alors facturées au même
tarif, même si l'une est à 2 km et l'autre à 9 km de route.

Pour facturer au trajet réel :

1. Console Google Cloud → **APIs & Services → Library**, activer :
   - **Places API** (autocomplétion d'adresse)
   - **Distance Matrix API** (mesure du trajet)
2. **Credentials → Create credentials → API key** → `GOOGLE_MAPS_API_KEY`.
3. Restreindre la clé **aux deux API ci-dessus**. Laisser la restriction
   d'application sur « Aucune » : la clé n'est lue que côté serveur
   (`lib/geo.ts` est marqué `server-only`), elle n'atteint jamais le navigateur
   — l'autocomplétion passe par `/api/address/suggest`.
4. Renseigner la variable en local et sur Vercel, puis **Redeploy**.
5. Admin → **Réglages** → « Calcul des frais de livraison » → « Au kilomètre ».
6. Admin → **Barème livraison** : régler les paliers (jusqu'à X km → frais +
   minimum de commande). Au-delà du dernier palier, la livraison est refusée.

> **Le repli est automatique.** Clé absente, quota dépassé, API muette : les
> zones de code postal reprennent la main sans que la commande échoue. C'est
> voulu — une panne chez Google ne doit pas arrêter la vente. Gardez donc les
> zones renseignées même en mode « au kilomètre ».
>
> Les deux API sont facturées à l'usage (~5 $/1000 requêtes). Les distances et
> géocodages sont mis en cache par adresse, la saisie est temporisée, et les
> routes sont limitées en débit (`lib/rateLimit.ts`) pour éviter qu'un script
> ne transforme la recherche d'adresse en note de frais.

## 5. Emails — Resend

1. Compte sur https://resend.com → **API Keys** → `re_…` → `RESEND_API_KEY`.
2. Vérifier un domaine d'envoi, puis renseigner `RESEND_FROM_EMAIL`
   (ex. `commandes@o3saveurs.fr`) et `RESTAURANT_NOTIFY_EMAIL` (copie restaurant).
3. À chaque commande confirmée : email client + notification restaurant.

### 5bis. Relance panier abandonné — GitHub Actions

Une commande en carte reste `en_attente_paiement` jusqu'à la confirmation
Stripe ; la session Stripe Checkout expire au bout de 30 minutes
(`app/api/checkout/route.ts`), après quoi le webhook l'annule et rend le
stock. Une relance par email n'a donc de sens que **dans cette fenêtre de
30 minutes** — incompatible avec les Cron Jobs Vercel, limités à une
exécution par jour sur l'offre Hobby.

La planification passe donc par GitHub Actions
(`.github/workflows/abandoned-carts.yml`), qui appelle
`GET /api/cron/abandoned-carts` toutes les 10 minutes :

1. Générer un secret : `openssl rand -base64 32` → `CRON_SECRET`.
2. L'ajouter aux variables d'environnement Vercel (**Settings → Environment
   Variables**).
3. Sur GitHub : **Settings → Secrets and variables → Actions**, créer deux
   secrets de dépôt :
   - `CRON_SECRET` — la même valeur qu'à l'étape 1.
   - `SITE_URL` — l'URL de production (ex. `https://o3saveurs.vercel.app`).
4. Le workflow tourne dès qu'il est poussé sur `main`. Vérifier dans l'onglet
   **Actions** du dépôt qu'il s'exécute et renvoie un code 200.

À savoir : GitHub désactive automatiquement les workflows planifiés après
60 jours sans commit sur le dépôt — un commit (même mineur) les réactive.

## 6. Déploiement Vercel

1. Pousser le repo sur GitHub, puis **Import Project** sur https://vercel.com.
2. **Framework : Next.js** (détecté). Aucune config spéciale : le build lance
   `prisma generate && next build`.
3. **Settings → Environment Variables** : coller toutes les clés du `.env`
   (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`,
   `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_ISSUER`, `ADMIN_EMAIL`,
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`,
   `RESEND_*`, `RESTAURANT_NOTIFY_EMAIL`, `CRON_SECRET`). Penser aussi à
   ajouter l'URL Vercel réelle dans les **Application URIs** d'Auth0
   (étape 2.4) une fois connue.
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
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_ISSUER` | Application Auth0 (Universal Login) |
| `ADMIN_EMAIL` | Adresse qui obtient le rôle `ADMIN` en se connectant via Auth0 (créée au seed) |
| `STRIPE_SECRET_KEY` | Clé serveur Stripe — **obligatoire en production** |
| `STRIPE_WEBHOOK_SECRET` | Vérification de la signature du webhook |
| `BLOB_READ_WRITE_TOKEN` | Upload des photos (Vercel Blob) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Envoi des emails |
| `RESTAURANT_NOTIFY_EMAIL` | Copie des commandes au restaurant |
| `CRON_SECRET` | Autorise `GET /api/cron/abandoned-carts` (appelée par GitHub Actions, voir §5bis) |
| `GOOGLE_MAPS_API_KEY` | **Facultative** — livraison au kilomètre (§4bis). Absente : facturation par zone de code postal |

## Comptes après seed

- **Admin** : l'adresse `ADMIN_EMAIL` obtient le rôle `ADMIN` dès sa première
  connexion via Auth0. Aucun mot de passe n'est géré par l'application.
- **Client de démonstration** (développement seulement, via `db:seed:demo`) :
  crée des commandes fictives pour tester l'affichage ; la connexion se fait
  désormais aussi via Auth0, le mot de passe posé par ce script n'est plus utilisé.

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
