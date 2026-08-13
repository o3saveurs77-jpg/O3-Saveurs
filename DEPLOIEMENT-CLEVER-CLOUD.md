# Mise en production — Clever Cloud, IONOS, Resend

Mode opératoire complet, dans l'ordre où il faut l'exécuter. Chaque étape dit
**ce qui casse si on la saute** : c'est ce qui permet de reprendre après une
interruption sans se demander où on en était.

Le site tourne aujourd'hui sur Vercel avec une base Neon. On va tout déplacer
chez Clever Cloud. Le code est prêt : plus aucune dépendance propriétaire
Vercel depuis le passage du stockage à S3.

---

## Avant de commencer

Il vous faut, ouverts devant vous :

- un compte **Clever Cloud** avec un moyen de paiement enregistré ;
- l'accès **IONOS** au domaine (probablement `o3saveurs.fr`) ;
- l'accès **Resend**, **Stripe** et **Auth0** ;
- les identifiants de la base **Neon** actuelle (dans votre `.env`).

Comptez deux heures, dont une d'attente (propagation DNS, vérification du
domaine chez Resend).

> **Choisissez un moment creux.** Entre la bascule DNS et la fin de la
> vérification Resend, les emails peuvent ne pas partir. Un mardi après-midi,
> pas un vendredi soir.

---

## 1. Base de données

```bash
clever login
clever create --type node o3-saveurs
clever addon create postgresql-addon --plan xs o3-saveurs-db
clever service link-addon o3-saveurs-db
```

L'addon injecte `POSTGRESQL_ADDON_URI`. Prisma attend `DATABASE_URL` et
`DIRECT_URL` : recopiez la même valeur dans les deux.

```bash
clever env set DATABASE_URL "postgresql://…"
clever env set DIRECT_URL "postgresql://…"
```

### Reprise des données existantes

Vos commandes, factures, plats et réglages vivent chez Neon. **Faites la copie
avant la bascule DNS**, pendant que l'ancien site tourne encore.

```bash
# 1. Sauvegarde depuis Neon (DIRECT_URL, pas l'URL « pooler »)
pg_dump --no-owner --no-privileges --format=custom \
  "postgresql://…neon…" > o3-sauvegarde.dump

# 2. Restauration vers Clever Cloud
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "postgresql://…clevercloud…" o3-sauvegarde.dump

# 3. Contrôle : les compteurs doivent correspondre des deux côtés
psql "postgresql://…clevercloud…" -c \
  'SELECT (SELECT count(*) FROM "Order") AS commandes,
          (SELECT count(*) FROM "Dish") AS plats,
          (SELECT count(*) FROM "Setting") AS reglages;'
```

**Gardez `o3-sauvegarde.dump`.** C'est votre seul retour en arrière si la
restauration s'avère incomplète après la bascule.

Puis appliquez les migrations, au cas où la sauvegarde daterait un peu :

```bash
npm run db:deploy
```

> **Si on saute cette étape :** le site démarre sur une base vide. Aucune
> commande, aucun plat, aucun réglage — et vos clients voient une carte vide.

---

## 2. Stockage des photos

```bash
clever addon create cellar-addon o3-photos
clever service link-addon o3-photos
```

L'addon injecte `CELLAR_ADDON_HOST`, `CELLAR_ADDON_KEY_ID` et
`CELLAR_ADDON_KEY_SECRET`. Créez ensuite un bucket depuis la console Cellar, en
**lecture publique**, puis :

```bash
clever env set CELLAR_BUCKET "o3-saveurs-photos"
clever env set NEXT_PUBLIC_STORAGE_HOST "cellar-c2.services.clever-cloud.com"
```

`NEXT_PUBLIC_STORAGE_HOST` doit porter **exactement** la même valeur que
`CELLAR_ADDON_HOST`. Les validateurs d'images tournent aussi dans le
navigateur, qui ne voit pas les variables serveur.

> **Si on saute cette étape :** le téléversement de photos affiche un message
> d'erreur explicite et rien d'autre ne casse. Les 42 photos livrées dans
> `public/` continuent de fonctionner. Ce n'est donc pas bloquant pour ouvrir.

> **Si les deux hôtes divergent :** les photos partent bien mais s'affichent en
> cadres vides, sans erreur nulle part. `npm run verif:prod` refuse de partir
> dans ce cas.

### Verser les photos livrées

```bash
npm run db:photos-cellar
```

Les photos de la livraison initiale vivaient dans `public/photos/`, servies par
Next ; celles téléversées depuis l'administration allaient sur Cellar. Deux
origines pour une même chose. Ce script verse les premières sur Cellar et
repointe la base — plats et sections de page.

`public/photos/` **reste dans le dépôt** : six commandes déjà passées y
référencent leurs plats, et une facture doit rester lisible telle qu'elle a été
émise. Le seed, lui, écrit toujours des chemins locaux, pour qu'une installation
neuve fonctionne sans stockage objet — relancer ce script après tout
`npm run db:seed`.

---

## 3. Variables d'environnement

Reprenez celles de Vercel, en corrigeant l'adresse publique :

```bash
clever env set NEXTAUTH_URL "https://o3saveurs.fr"
clever env set AUTH_SECRET "…"
clever env set AUTH0_CLIENT_ID "…"
clever env set AUTH0_CLIENT_SECRET "…"
clever env set AUTH0_ISSUER "https://…auth0.com"
clever env set AUTH0_M2M_CLIENT_ID "…"
clever env set AUTH0_M2M_CLIENT_SECRET "…"
clever env set STRIPE_SECRET_KEY "…"
clever env set STRIPE_WEBHOOK_SECRET "…"      # à régénérer, voir §7
clever env set RESEND_API_KEY "…"
clever env set RESEND_FROM_EMAIL "commandes@o3saveurs.fr"
clever env set RESTAURANT_NOTIFY_EMAIL "…"
clever env set ADMIN_EMAIL "…"
clever env set CRON_SECRET "$(openssl rand -base64 32)"
```

Contrôle, avant tout déploiement :

```bash
clever ssh
npm run verif:prod
```

Il énumère ce qui manque **et ce que chaque manque casse concrètement**.

---

## 4. Compilation

**Clever Cloud ne compile pas tout seul.** Contrairement à Vercel, qui
reconnaissait Next.js et lançait le build de lui-même, un applicatif Node
enchaîne ici `npm install` puis `npm start` — et rien entre les deux. Il faut
donc réclamer la compilation explicitement :

```bash
clever env set CC_POST_BUILD_HOOK "npm run build"
```

Le crochet tourne après l'installation des dépendances et avant la mise en
cache, ce qui évite de recompiler à chaque redémarrage.

Prévoyez aussi une machine de compilation dédiée. L'instance de production est
petite : Clever Cloud y impose `--max-old-space-size=644`, et `next build`
dépasse ce plafond sur un projet de cette taille.

```bash
clever scale --build-flavor M
```

> **Si on saute le crochet :** le déploiement paraît réussir jusqu'au bout,
> puis s'arrête sur `Could not find a production build in the '.next'
> directory`. Le site ne démarre pas du tout.

> **Si on saute la machine dédiée** (constaté le 2026-08-13) **:** le build
> démarre, affiche `Creating an optimized production build`, puis meurt au bout
> de deux minutes sur :
>
> ```
> Next.js build worker exited with code: null and signal: SIGKILL
> ```
>
> Pas de `JavaScript heap out of memory`, pas de trace : c'est le noyau qui tue
> le processus, et il ne laisse rien derrière lui. Le message ressemble à un
> plantage de Next.js — il n'en est pas un.
>
> Ne pas tenter de relever `NODE_OPTIONS` à la place. Les 644 Mo sont dérivés de
> la mémoire physique de l'instance : autoriser un tas plus grand que la machine
> ne fait qu'avancer le moment où le noyau intervient.

---

## 5. Premier déploiement

```bash
git push clever main
clever logs --follow
```

Vous devez voir passer `Creating an optimized production build` : c'est la
preuve que le crochet de compilation est bien pris en compte. Ouvrez ensuite
l'URL temporaire fournie par Clever Cloud et vérifiez que la carte s'affiche :
c'est le signe que la base répond.

---

## 6. Domaine chez IONOS

Dans Clever Cloud : *Domain names* → ajouter `o3saveurs.fr` et `www.o3saveurs.fr`.

Chez IONOS, dans la zone DNS :

| Type    | Nom   | Valeur                              |
| ------- | ----- | ----------------------------------- |
| `A`     | `@`   | l'IP indiquée par Clever Cloud      |
| `CNAME` | `www` | `domain.clever-cloud.com.`          |

Le certificat HTTPS est engendré automatiquement une fois la propagation faite
(quelques minutes à quelques heures). N'annoncez rien avant d'avoir le cadenas.

> **Si on saute cette étape :** le site n'est joignable que sur l'URL
> `*.cleverapps.io`, et Auth0 refusera la connexion — l'URL de rappel ne
> correspondra plus.

---

## 7. Reconfigurer les services externes

Ces trois-là pointent encore sur Vercel. **Tant qu'ils ne sont pas repointés,
le site est en ligne mais ne fonctionne pas vraiment.**

### Auth0
*Applications → o3-saveurs → Settings* :
- **Allowed Callback URLs** : `https://o3saveurs.fr/api/auth/callback/auth0`
- **Allowed Logout URLs** : `https://o3saveurs.fr`

Gardez les entrées `localhost` pour le développement. Vérifiez ensuite avec
`npm run auth0:check`.

> Sans cela : `OAuthCallbackError` à chaque tentative de connexion.

### Stripe
*Developers → Webhooks* : créez un point de terminaison sur
`https://o3saveurs.fr/api/webhooks/stripe`, avec les événements
`checkout.session.completed`, `checkout.session.expired`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
et `charge.refunded`.

**Le secret de signature change** : reportez le nouveau dans
`STRIPE_WEBHOOK_SECRET`.

> Sans cela : le client paie, Stripe encaisse, et la commande reste « en
> attente de paiement ». Ni facture, ni passage en cuisine. C'est la panne la
> plus coûteuse de la liste, et la plus silencieuse.

### Resend
*Domains* → ajouter `o3saveurs.fr`. Resend fournit des enregistrements **SPF**,
**DKIM** et **DMARC** à créer chez IONOS.

Attendez la vérification avant d'annoncer l'ouverture : sans elle, vos emails
partent en indésirables, quand ils partent.

> Sans cela : ni confirmation de commande, ni facture, ni alerte de nouvelle
> commande. Vous ne sauriez même pas qu'on a commandé.

---

## 8. Tâches planifiées

`clevercloud/cron.json` est déjà dans le dépôt. Clever Cloud le lit au
déploiement — rien à faire, mais vérifiez qu'elles tournent :

```bash
clever logs | grep cron
```

Deux tâches :

- **4 h du matin — anonymisation RGPD.** Obligation légale, pas une option :
  commandes facturées conservées 10 ans (code de commerce), non facturées
  3 ans, puis anonymisées.
- **Toutes les 30 min — relance des paniers abandonnés.**

> **À savoir :** sur Vercel, aucune des deux n'a jamais tourné — il n'y avait
> pas de `vercel.json`. Le code existait, rien ne l'appelait. Votre obligation
> d'anonymisation n'a donc jamais été honorée jusqu'ici.

---

## 9. Contrôle final

Dans l'ordre, sur le domaine définitif :

1. La carte s'affiche, avec les vrais plats.
2. Connexion : vous arrivez sur le back-office, pas sur l'espace client.
3. **Une commande réelle à 1 €, payée par carte.** Vérifiez que vous recevez
   l'alerte, que le client reçoit sa facture PDF, et que la commande apparaît
   en cuisine. *Cette chaîne complète n'a jamais tourné une seule fois.*
4. Remboursez cette commande depuis le back-office : l'avoir doit arriver.
5. `npm run verif:prod` : tout au vert.

---

## Ne pas oublier

- **Les mentions légales sont vides en base** — dénomination, forme juridique,
  SIRET. Tant qu'elles manquent, **aucune facture émise n'est conforme**
  (art. 242 nonies A du CGI). À renseigner dans Réglages avant la première
  vente.
- **L'adresse du restaurant diverge** : « 6 bis rue du Village, 77185 Lognes »
  en base contre « 38 rue des Prés Saint-Martin, 77340 Pontault-Combault » dans
  le pied de page. Tranchez avant d'ouvrir.
- **Ne coupez pas Vercel et Neon tout de suite.** Laissez-les une semaine : si
  quelque chose manque dans la copie, la source est encore là.
