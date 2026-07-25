# Audit — Ô 3 Saveurs · Chez Laila

Audit réalisé le **25 juillet 2026** sur `c:\Users\andry\Bureau\O3 Saveurs`.
Périmètre : `app/`, `components/`, `lib/`, `prisma/`, `tests/`, configuration, déploiement, conformité.
Hors périmètre : les `*.jsx` et `data.js` à la racine (maquettes de référence, exclues du build).

---

## Verdict

Le projet **compile, se type et se teste proprement**, et la base de code est saine : architecture claire, `lib/` pur séparé des routes et des composants, gestion élégante du mode démo sans clés, aucune dépendance inutile.

Mais il **ne peut pas être mis en ligne en l'état**, pour trois raisons qui n'ont rien à voir avec la qualité du code :

1. **L'API est publique en lecture et en écriture.** Le fichier clients complet se récupère en une requête, et n'importe qui peut vider la carte ou passer les frais de livraison à zéro.
2. **Les montants payés sont ceux que le navigateur veut bien envoyer.** Un panier de 80 € peut être encaissé à 1 centime, et rien dans le back-office ne le détecte.
3. **Aucune page légale n'existe**, et l'information sur les allergènes est absente — c'est une obligation pénalement sanctionnée pour de la vente de nourriture à distance.

S'y ajoute un problème d'un autre ordre : **le projet n'est pas versionné**. Aucun historique, aucun retour arrière. C'est la première chose à corriger, avant toute modification.

Les correctifs listés ici sont ciblés, pas structurels. Il n'y a pas de réécriture à prévoir.

### État vérifié le 25/07/2026

| Contrôle | Résultat |
| --- | --- |
| `npx tsc --noEmit` | ✅ aucune erreur |
| `npm test` (vitest) | ✅ 27/27 sur 5 fichiers |
| `npm run build` | ✅ compilé en 49 s, 27 routes, middleware 87 kB |
| `npm run lint` | ❌ ne lint rien — ESLint n'est pas installé |
| Secrets dans `.env` | ✅ uniquement des placeholders, aucun secret réel |
| Dépôt git | ❌ **aucun** (`.git` absent) |
| Cohérence schéma Prisma ↔ migration SQL | ✅ 5 modèles conformes, aucune dérive |

---

## 1. Ce qui bloque la mise en ligne

Dans l'ordre où il faut les traiter.

1. **Versionner le projet** — nettoyer les 29 Mo morts, puis `git init` avant tout le reste (§7.1).
2. **Fermer l'API** — gardes ADMIN sur les routes de mutation, cloisonnement de `GET /api/orders` (§2.1 à §2.4).
3. **Recalculer les montants côté serveur** — la fraude à 1 centime (§3.1).
4. **Retirer les mentions « paiement simulé »** de l'écran de paiement (§3.2).
5. **Retirer l'auto-avancement du statut** de commande par le navigateur du client (§3.3).
6. **Rendre le seed non destructif** — `db:seed` efface actuellement toute la production (§3.4).
7. **Corriger la facture** — mention de TVA erronée, numérotation non conforme, paiement affirmé à tort (§4.1 à §4.3).
8. **Rédiger les trois pages légales** + case CGV non pré-cochée au checkout (§5).
9. **Ajouter les allergènes** — champ en base, saisie admin, affichage client (§5).
10. **Écrire les deux tests qui verrouillent tout ça** — calcul des totaux et contrôle d'accès des routes (§7.3).

Deux de ces points ne dépendent pas du développement et sont à lancer auprès de la cliente **dès maintenant**, car ils sont sur le chemin critique : les informations légales de l'entreprise (SIRET, forme juridique, n° TVA) et la saisie des allergènes plat par plat.

---

## 2. Sécurité et contrôle d'accès

Constat d'architecture : **une seule route API sur onze vérifie qui appelle** (`/api/upload`). Le `middleware.ts` ne couvre que `/admin/:path*` ([middleware.ts:9](middleware.ts#L9)), aucune route `/api/*` n'est protégée, et aucun handler ne contrôle de rôle. Le back-office est donc une API publique en écriture.

À noter : la version installée est `next@15.5.19`, au-delà du correctif de CVE-2025-29927 — le contournement de middleware par en-tête `x-middleware-subrequest` n'est pas exploitable ici. Le problème n'est pas le middleware, c'est qu'il est la seule barrière et qu'il ne couvre pas l'API.

### 2.1 CRITIQUE — Le fichier clients complet est public

[app/api/orders/route.ts:12-19](app/api/orders/route.ts#L12-L19) : aucun contrôle d'accès. Le `?email=` est un filtre optionnel, pas une restriction — sans paramètre la route renvoie **toutes les commandes** avec nom, email, téléphone, adresse de livraison et montants. Aucune pagination.

Aggravant : `OrdersProvider` est monté dans le **layout racine** ([app/layout.tsx:44](app/layout.tsx#L44)) et appelle `fetch("/api/orders")` au montage ([components/providers/OrdersContext.tsx:35](components/providers/OrdersContext.tsx#L35)). Le navigateur de **chaque visiteur anonyme** télécharge donc déjà tout le fichier clients dès la page d'accueil, y compris sur `/contact` et `/a-propos`. Exploitation : `curl https://site/api/orders`.

Le filtrage « mes commandes » de l'espace client est purement cosmétique, fait côté navigateur ([components/account/AccountClient.tsx:187-191](components/account/AccountClient.tsx#L187-L191)).

C'est une violation caractérisée de l'art. 32 RGPD (sécurité du traitement), exploitable en une requête, avec obligation de notification CNIL sous 72 h si elle est exploitée en production.

Correctif : exiger `auth()` ; tout renvoyer si `role === "ADMIN"`, sinon forcer `where: { customerEmail: session.user.email }` **en ignorant** le `?email=` du client ; 401 sans session. Sortir `OrdersProvider` du layout racine et ne le monter que sous `/compte` et `/admin` via des route groups. Paginer.

### 2.2 CRITIQUE — IDOR : la facture d'un autre client est lisible

[app/api/orders/[id]/route.ts:11-16](app/api/orders/[id]/route.ts#L11-L16) : GET sans authentification ni vérification de propriété. Les pages `/commande/[id]` et `/facture/[id]` ne font aucun contrôle serveur non plus et lisent la commande dans la liste complète déjà chargée par le provider ([OrdersContext.tsx:64](components/providers/OrdersContext.tsx#L64)). Changer l'identifiant dans l'URL de `/facture/` affiche une facture nominative complète avec l'adresse de livraison.

Les identifiants sont des `cuid()` v1, partiellement prédictibles (horodatage + compteur) — mais le point est théorique tant que §2.1 fournit la liste complète des ids.

Correctif : GET restreint au propriétaire ou à un ADMIN ; pour l'accès invité, un jeton aléatoire stocké sur la commande plutôt que l'id ; passer `/facture/[id]` et `/commande/[id]` en Server Components qui chargent la commande autorisée côté serveur. Migrer vers `cuid2` ou `uuid(7)`.

### 2.3 CRITIQUE — La carte et les tarifs de livraison sont modifiables par n'importe qui

Sans être connecté, depuis Internet :

| Requête | Effet | Fichier |
| --- | --- | --- |
| `POST /api/dishes` | ajouter un plat | [dishes/route.ts:15](app/api/dishes/route.ts#L15) |
| `PATCH /api/dishes/{id}` | mettre tous les prix à 0,01 € | [dishes/[id]/route.ts:9](app/api/dishes/[id]/route.ts#L9) |
| `DELETE /api/dishes/{id}` | vider la carte | [dishes/[id]/route.ts:21](app/api/dishes/[id]/route.ts#L21) |
| `PUT /api/zones` | frais de livraison et minimums à 0 | [zones/route.ts:14](app/api/zones/route.ts#L14) |
| `PATCH /api/orders/{id}` | passer une commande en « livrée » ou « annulée » | [orders/[id]/route.ts:19](app/api/orders/[id]/route.ts#L19) |

Combiné à §3.1, mettre les prix à 0,01 € puis commander donne un paiement Stripe **réellement encaissé** à 1 centime.

Sur le PATCH des commandes, `status` est bien validé contre une liste blanche ([:24](app/api/orders/[id]/route.ts#L24)) mais `driver` accepte n'importe quelle chaîne. Sur les zones, `fee` et `min` sont acceptés sans borne (valeurs négatives persistées) et `prisma.zone.update` n'a pas de `try/catch` ([:23](app/api/zones/route.ts#L23)) → 500 opaque si l'`idx` n'existe pas.

Correctif : le garde déjà utilisé dans `/api/upload`, en tête de chaque handler de mutation.

```ts
const session = await auth();
if (session?.user?.role !== "ADMIN")
  return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
```

Ajouter aussi `/api/dishes/:path*` et `/api/zones/:path*` au matcher du middleware, en défense en profondeur — mais jamais comme unique parade.

### 2.4 ÉLEVÉ — `AUTH_SECRET` et mot de passe admin par défaut

`.env` contient un `AUTH_SECRET` placeholder et `ADMIN_PASSWORD=admin1234`, repris par défaut dans [prisma/seed.ts:12](prisma/seed.ts#L12) et documenté en clair dans `DEPLOY.md`. La stratégie de session est `jwt` : avec un secret devinable, on forge un token `role: "ADMIN"` et on entre dans le back-office. Et comme le seed **crée ou met à jour** l'admin, le lancer en prod avec la variable oubliée réinstalle `admin1234` sur le compte qui contrôle tout.

Correctif : générer `AUTH_SECRET` par environnement (`openssl rand -base64 32`) ; faire **échouer bruyamment** le seed si `ADMIN_PASSWORD` est absent ou fait moins de 12 caractères, au lieu de retomber sur un défaut ; retirer le mot de passe de `DEPLOY.md`.

Incohérence au passage : `ADMIN_EMAIL` par défaut vaut `admin@o3saveurs.fr` dans [prisma/seed.ts:11](prisma/seed.ts#L11) mais `laila@o3saveurs.fr` dans `DEPLOY.md` et `.env.example`.

### 2.5 MOYEN — Validation, débit, en-têtes

- **Aucune validation d'entrée structurée** (pas de zod). Les corps sont castés en TypeScript (`as Body`), ce qui ne garantit rien à l'exécution. `await req.json()` sans `.catch()` dans cinq routes → 500 sur corps malformé. `register` ne valide pas le format de l'email et ne plafonne pas le mot de passe (bcrypt tronque à 72 octets). `PATCH /api/auth/me` `JSON.stringify` un payload arbitraire sans limite de taille — un client peut écrire plusieurs Mo dans sa ligne `User`.
- **Aucune limitation de débit** nulle part : bruteforce illimité sur la connexion, création massive de comptes, et surtout inondation de `POST /api/orders` qui **déclenche un email Resend à chaque appel** ([orders/route.ts:66](app/api/orders/route.ts#L66)) → quota épuisé et domaine expéditeur blacklistable.
- **Injection HTML dans les emails** : [lib/email.ts:19](lib/email.ts#L19), [:26](lib/email.ts#L26), [:32](lib/email.ts#L32) interpolent nom, adresse et libellés de plats sans échappement, dans un email envoyé **depuis le domaine du restaurant** vers la boîte de Laila. Un client dont le nom contient un lien obtient un phishing signé par le restaurant.
- **Aucun en-tête de sécurité** : pas de bloc `headers()` dans `next.config.mjs` (ni CSP, ni `X-Frame-Options`, ni `Referrer-Policy`, ni HSTS). `/facture/[id]` est encadrable.
- **Énumération de comptes** : `register` renvoie un 409 explicite « Un compte existe déjà avec cet email ».
- **bcrypt à 10 tours** (recommandation actuelle : 12), en `bcryptjs` JS pur.

---

## 3. L'argent et le paiement

### 3.1 CRITIQUE — Fraude sur le montant payé

[app/api/checkout/route.ts:68](app/api/checkout/route.ts#L68) envoie à Stripe `unit_amount: Math.round(l.unitPrice * 100)` où `unitPrice` **vient du corps de la requête**. Le handler ne lit jamais la table `Dish`. `subtotal`, `fee` et `total` sont également repris tels quels ([:30](app/api/checkout/route.ts#L30), [:46-48](app/api/checkout/route.ts#L46-L48)).

Un `POST /api/checkout` forgé avec `unitPrice: 0.01, subtotal: 0.01, fee: 0` produit une session Stripe légitime à 1 centime, une commande en base, un email de confirmation et `paid: true` par le webhook. **Commande, facture et paiement sont parfaitement cohérents entre eux — sur une valeur fausse.** Rien dans le back-office ne permet de le voir. Même vecteur sur [app/api/orders/route.ts:40](app/api/orders/route.ts#L40) pour les commandes en espèces (montant falsifié annoncé au livreur).

Le minimum de commande n'est lui aussi bloqué que par le bouton dans le navigateur ([CheckoutClient.tsx:42](components/checkout/CheckoutClient.tsx#L42)) : un POST direct passe outre.

Correctif — c'est la correction la plus rentable du projet, car elle ferme la fraude **et** rend le calcul testable :

1. Extraire un `lib/pricing.ts` pur : `computeOrderTotal(lines, zone, mode)`.
2. Dans les deux routes, ignorer `subtotal`, `fee` et `unitPrice` du corps.
3. Recharger les plats par `dishId` (`prisma.dish.findMany({ where: { id: { in: ids } } })`), vérifier `available` et `price != null`, recalculer prix unitaire, options et formules.
4. Relire `fee` et `minimum` depuis la table `Zone` via `zoneIdx`, rejeter en 400 si le minimum n'est pas atteint.
5. Borner `qty` (entier, 1–50), refuser les `dishId` inconnus.

### 3.2 CRITIQUE — L'écran dit « aucune carte débitée » alors que Stripe encaisse

[components/checkout/CheckoutClient.tsx:225](components/checkout/CheckoutClient.tsx#L225) : « Démonstration — le paiement sécurisé Stripe sera branché prochainement. »
[components/checkout/CheckoutClient.tsx:300](components/checkout/CheckoutClient.tsx#L300), juste sous le bouton *Payer* : « Paiement simulé — aucune carte débitée. »

Or le bouton déclenche une vraie session Stripe Checkout ([:87-96](components/checkout/CheckoutClient.tsx#L87-L96)). Le client valide un paiement réel après avoir lu l'inverse, deux lignes au-dessus. Une capture d'écran rend tout litige indéfendable, et un taux de contestation élevé fait suspendre un compte Stripe. **À supprimer avant la première vraie clé Stripe.**

### 3.3 CRITIQUE — Le navigateur du client fait avancer le statut réel en base

[components/order/OrderTracker.tsx:24-30](components/order/OrderTracker.tsx#L24-L30) avance le statut toutes les 12 secondes, et `setStatus` envoie un vrai `PATCH /api/orders/[id]` qui écrit en base ([OrdersContext.tsx:66-75](components/providers/OrdersContext.tsx#L66-L75)).

Un client qui laisse l'onglet de suivi ouvert fait passer sa commande `confirmee → cuisine → route → livree` en **36 secondes**. Laila voit toutes ses commandes « Livrées » avant de les avoir lues, l'écran `/admin/livraisons` (qui exclut `livree`) se vide tout seul, et le taux de livraison du tableau de bord est fictif. Effet secondaire : `order` est dans les dépendances de l'effet alors que son identité change à chaque rafraîchissement du contexte, donc le timer se relance en boucle.

Correctif : supprimer ce `useEffect`. Le suivi doit être en lecture seule côté client, les transitions réservées à l'admin.

### 3.4 CRITIQUE — `npm run db:seed` détruit les données de production

[prisma/seed.ts:26-30](prisma/seed.ts#L26-L30) commence par `deleteMany()` sur `order`, `dish`, `zone`, `dailySpecial` et `user`. Et `DEPLOY.md` prescrit explicitement `npm run db:deploy && npm run db:seed` sur la base de prod, à deux endroits. Rejouer ce seed — redéploiement, nouvel environnement, reprise après incident — **efface toutes les commandes, tous les comptes clients et toutes les factures**, puis réinjecte des commandes fictives via `generateDemoOrders`.

Pire : ces fausses commandes sont indistinguables des vraies (même table, `paid: true`, montants crédibles) et gonflent le CA du tableau de bord, la liste Clients et l'écran Facturation. **Aucun chiffre du back-office n'est fiable tant qu'elles sont là.**

Correctif : scinder en `db:seed` (catalogue, zones, admin — idempotent par `upsert`, sans `deleteMany`) et `db:seed:demo` (avec `if (process.env.NODE_ENV === "production") throw`). Corriger `DEPLOY.md`. Purger les commandes de démo déjà en base.

### 3.5 ÉLEVÉ — Le repli « Stripe non configuré » rend les commandes gratuites

[app/api/checkout/route.ts:59-62](app/api/checkout/route.ts#L59-L62) : si `isStripeConfigured()` est faux, la commande passe à `paid: true` et le client voit « Merci pour votre commande ». Or `isStripeConfigured()` ([lib/stripe.ts:6-7](lib/stripe.ts#L6-L7)) teste seulement la présence de la clé et l'absence du mot « placeholder ». Si `STRIPE_SECRET_KEY` est absente ou mal renseignée en production — oubli, mauvais environnement Preview/Production, rotation de clé — **toutes les commandes deviennent gratuites et marquées payées, silencieusement**, et entrent en cuisine.

Correctif : gater ce chemin sur `NODE_ENV !== "production"` **et** un flag explicite `ALLOW_MOCK_PAYMENT=1` ; en production, renvoyer 503 sans créer la commande.

### 3.6 ÉLEVÉ — Webhook Stripe : signature OK, tout le reste manque

Point solide : la signature est correctement vérifiée sur le corps brut ([app/api/webhooks/stripe/route.ts:14-23](app/api/webhooks/stripe/route.ts#L14-L23)). Manquent :

- **Aucun rapprochement de montant** entre `cs.amount_total` et `order.total` ([:30-33](app/api/webhooks/stripe/route.ts#L30-L33)) — indispensable dès lors que le montant vient du client.
- **`cs.payment_status` n'est pas testé** : `checkout.session.completed` peut arriver avec `payment_status: "unpaid"` pour les paiements différés → commande marquée payée sans encaissement.
- **Aucune idempotence** : un retry Stripe du même événement renvoie `sendOrderConfirmation` ([:34](app/api/webhooks/stripe/route.ts#L34)) → emails dupliqués au client et à Laila.
- **`checkout.session.expired` et `async_payment_failed` non traités** → commandes fantômes bloquées en « confirmee ».
- **En cas d'échec DB, la route répond 200** ([:36](app/api/webhooks/stripe/route.ts#L36), [:41](app/api/webhooks/stripe/route.ts#L41)) : Stripe considère l'événement traité et ne réessaie pas ; la commande reste impayée en base, avec un simple `console.error` pour trace.

Correctif : vérifier `payment_status === "paid"` et `amount_total === Math.round(order.total * 100)` (sinon `status: "litige"` + alerte), rendre l'écriture idempotente sur `stripeSessionId`, stocker le `paymentIntentId`, traiter `expired`/`async_payment_failed` → `annulee`, et renvoyer 500 sur échec DB pour déclencher le retry.

### 3.7 ÉLEVÉ — Paiement abandonné : panier perdu et commande fantôme en cuisine

`clear()` est appelé **avant** la redirection vers Stripe ([CheckoutClient.tsx:95](components/checkout/CheckoutClient.tsx#L95)). Le client qui abandonne revient sur `/commander?canceled=1` : panier vide, `?canceled=1` lu nulle part dans le front (`?paid=1` non plus), message « Votre panier est vide » sans explication. Vente perdue.

Symétriquement, la commande a été créée avec `status: "confirmee"` et `paid: false` et **reste** au back-office libellée « Confirmée ». `OrdersAdmin` n'affiche jamais `paid` : rien ne distingue une commande payée d'un panier abandonné. Laila cuisine des commandes jamais payées. Idem si le webhook n'arrive jamais.

Correctif : vider le panier seulement au retour confirmé ; introduire un statut `en_attente_paiement` distinct de `confirmee`, promu par le webhook uniquement ; badge « Non payée » dans `OrdersAdmin` ; purge des commandes en attente de plus de 30 min ; lire `?canceled=1` pour afficher un bandeau.

### 3.8 ÉLEVÉ — Suppression de la commande sur erreur Stripe : paiement sans commande

[app/api/checkout/route.ts:104-108](app/api/checkout/route.ts#L104-L108) supprime la commande si `sessions.create` échoue. Sur un **timeout réseau**, la session peut avoir été créée chez Stripe sans que la réponse revienne : le client paie, et le webhook référence un `orderId` inexistant → l'`update` échoue → simple `console.error`. **Argent encaissé, aucune trace de commande, aucun email, client sans plat.**

Correctif : ne pas supprimer — marquer `status: "echec_creation"` et exclure ces lignes du back-office opérationnel ; passer `idempotencyKey: order.id` à Stripe pour rendre la création réessayable sans doublon.

### 3.9 ÉLEVÉ — Les frais de livraison sont décidés par le client, et l'écran admin Zones ne sert à rien

Deux problèmes qui se cumulent.

**La zone est un `<select>` libre** ([CheckoutClient.tsx:150-165](components/checkout/CheckoutClient.tsx#L150-L165)). Un client de Serris (zone 4 : 5,50 €, minimum 35 €) sélectionne « Zone 1 » (2,50 €, minimum 15 €) et se fait livrer à 25 km pour 2,50 €. Les champs `zip` et `city` sont saisis mais **jamais confrontés** à `zoneIdx`, ni côté client ni côté serveur, et un `zoneIdx: 99` est accepté (affiché ensuite « Zone 100 » dans le suivi).

**Le checkout n'utilise pas la base.** Il importe les zones **en dur** depuis [lib/menu.ts:82-87](lib/menu.ts#L82-L87), alors que `ZonesAdmin` lit et écrit la table `Zone`. Quand Laila passe les frais de zone 1 de 2,50 € à 3,50 €, l'admin affiche 3,50 €, la base contient 3,50 €, **et le client continue de payer 2,50 € indéfiniment**. Même divergence sur la page d'accueil et dans `ZoneCheck` (« On vous livre ? » annonce des tarifs obsolètes). C'est aussi un risque de litige sur le prix annoncé (art. L112-1 C. conso).

Il n'existe par ailleurs **aucune logique de code postal** dans le projet : `normalizeCity` ([lib/zones.ts:6-12](lib/zones.ts#L6-L12)) supprime les chiffres, donc un code postal devient la chaîne vide et `findZoneForCity` renvoie `null`. Et le rapprochement se fait par inclusion bidirectionnelle ([lib/zones.ts:29-32](lib/zones.ts#L29-L32)) : « marne » correspond à Champs-sur-Marne (zone 1) **avant** Vaires-sur-Marne (zone 2) — en cas d'ambiguïté c'est toujours la zone la moins chère qui gagne. Les tests actuels ne couvrent que des noms complets et ne détectent pas ce cas.

Correctif : déduire `zoneIdx` côté serveur depuis `city`/`zip` via la table `Zone`, refuser une livraison hors zone, ajouter une colonne `zips` pour un rapprochement fiable, exiger une correspondance exacte sur la ville normalisée, et consommer les zones via `/api/zones` côté front (un `ZonesContext` sur le modèle de `DishesContext`). `lib/menu.ts:zones` redevient une simple donnée de seed.

### 3.10 ÉLEVÉ — Les horaires d'ouverture ne sont vérifiés nulle part

`info.hours` ([lib/menu.ts:69-74](lib/menu.ts#L69-L74)) est purement décoratif — aucune fonction `isOpen` dans le projet. Conséquences : une commande peut être passée et payée à 4 h du matin ; les créneaux proposés incluent 12:00, 12:30 et 13:00 alors que le restaurant est **fermé le midi le vendredi et le dimanche** ; aucun créneau déjà passé n'est retiré de la liste.

Correctif : un `lib/hours.ts` dérivé d'une structure typée (pas des chaînes `"11h30 – 14h30"`) pour filtrer les créneaux à l'affichage **et** rejeter en 409 côté `/api/checkout` et `/api/orders`, avec un bandeau « Fermé — commandez pour le prochain service ».

### 3.11 MOYEN — Panier localStorage jamais revalidé, et repli silencieux sur le catalogue de démo

Les lignes de panier figent `unitPrice`, `name` et `photo` ([components/cart/CartContext.tsx:80](components/cart/CartContext.tsx#L80)) et sont rechargées depuis `localStorage` sans revalidation. Le `try/catch` de l'hydratation protège du crash mais **ne valide pas la forme** : `lines` peut contenir un `unitPrice` négatif et part au serveur, qui lui fait confiance. Un panier repris une semaine plus tard est encaissé à l'ancien tarif, éventuellement sur un plat supprimé — le contrôle `available` n'existe qu'à l'ajout.

Par ailleurs [components/providers/DishesContext.tsx:22](components/providers/DishesContext.tsx#L22) initialise l'état avec les `seedItems` de `lib/menu.ts` puis remplace par la réponse de `/api/dishes`. Si l'appel échoue — base Neon indisponible, `DATABASE_URL` invalide — le `catch` est vide et **le site continue d'afficher la carte de démonstration avec ses prix**, sans aucun signal. Des clients commanderaient alors aux prix de la maquette, avec des `dishId` littéraux qui n'existent pas en base — que le recalcul serveur de §3.1 ne pourra pas résoudre.

---

## 4. Facturation et chiffres du back-office

### 4.1 BLOQUANT — Mention de TVA erronée sur les factures

[components/invoice/InvoiceClient.tsx:131](components/invoice/InvoiceClient.tsx#L131) affiche « TVA non applicable, art. 293 B du CGI ». Cette ligne a été **copiée du bloc de signature du développeur** dans la spec ([O3-Saveurs-Chez-Laila-PROJET.md:210-213](O3-Saveurs-Chez-Laila-PROJET.md#L210-L213) : *Magar Développement — Auto-entrepreneur … TVA non applicable, art. 293 B du CGI*). Elle est fausse pour un restaurant : la vente de nourriture à emporter ou livrée relève de la TVA à **10 %** (art. 279 m CGI), 20 % sur l'alcool.

La facture affiche par ailleurs un « Total TTC » sans jamais ventiler HT / TVA / TTC, ce qu'exige l'art. 242 nonies A du CGI, et il manque le SIRET, le n° de TVA et une adresse de vendeur normalisée.

Correctif : supprimer la ligne, ventiler Total HT / TVA 10 % / Total TTC, ajouter les mentions obligatoires. **À valider avec le comptable de Laila** — c'est son régime qui décide, pas le code.

### 4.2 BLOQUANT — Numérotation de facture aléatoire, non conforme

Le numéro dérive de `ref` : `"FACT-" + année + "-" + ref` ([InvoiceClient.tsx:24-28](components/invoice/InvoiceClient.tsx#L24-L28)), or `ref` est tiré au hasard sur 4 caractères dans un alphabet de 31 ([lib/ref.ts:2-5](lib/ref.ts#L2-L5)). Une numérotation aléatoire et non séquentielle ne satisfait pas l'obligation de séquence chronologique continue (art. 242 nonies A CGI).

S'y ajoute un bug de disponibilité : 31⁴ = 923 521 combinaisons sur un champ `@unique`. Par le paradoxe des anniversaires, la probabilité de collision atteint ~5 % dès 300 commandes et ~50 % vers 1 100 — quelques mois pour un restaurant. Une collision fait lever `prisma.order.create` **sans `try/catch`** → 500 au moment de payer, panier déjà vidé.

Correctif : séparer les deux besoins. (a) `ref` lisible pour le client, allongé à 6 caractères via `crypto.randomInt`, avec retry sur violation `P2002`. (b) Un `invoiceNumber Int @default(autoincrement())` distinct, **figé à l'émission** dans une table `Invoice` avec son total — pour que la facture ne bouge plus si la commande est modifiée.

### 4.3 ÉLEVÉ — La facture atteste d'un paiement qui n'a pas eu lieu

[components/invoice/InvoiceClient.tsx:82](components/invoice/InvoiceClient.tsx#L82) affiche « Payé par {paymentMethod} » sans jamais consulter `order.paid`. Une commande en espèces non encaissée, ou dont le webhook n'est jamais arrivé, produit une **pièce comptable fausse** — et un argument pour un client de mauvaise foi.

Le moyen de paiement enregistré est de plus celui **cliqué avant** la redirection, pas celui réellement utilisé sur Stripe.

Correctif : afficher « Payé par X le \<date\> » ou « Reste à payer » selon `paid` ; lire le moyen réel depuis le PaymentIntent.

### 4.4 ÉLEVÉ — CA du tableau de bord ≠ encaissé de la facturation

`kpis()` ([lib/analytics.ts:54-84](lib/analytics.ts#L54-L84)) somme toutes les commandes non annulées, payées ou non. `FacturationAdmin` ne garde que `o.paid`. Or les commandes « Espèces sur place » naissent `paid: false` et **il n'existe aucun moyen de les marquer payées** : `PATCH /api/orders/[id]` n'accepte que `status` et `driver`. Tout le chiffre d'affaires en espèces est donc invisible en Facturation et absent de l'export CSV, tout en étant compté dans le CA de la vue d'ensemble. Deux chiffres contradictoires sur deux écrans voisins.

Correctif : autoriser `paid` dans le PATCH admin avec un bouton « Encaissé » dans `OrdersAdmin`, et libeller explicitement les deux notions (CA commandé vs CA encaissé).

### 4.5 MOYEN — Montants en `Float` : dérive de centimes irréversible

`Dish.price`, `Zone.fee`, `Order.subtotal`/`fee`/`total` sont des `Float` → `DOUBLE PRECISION` en base ([prisma/schema.prisma:27](prisma/schema.prisma#L27), [:46-47](prisma/schema.prisma#L46-L47), [:87-89](prisma/schema.prisma#L87-L89)).

Cas réel avec les prix existants : 3 × 3,99 € donne `11.969999999999999` en flottant, stocké tel quel, alors que Stripe facture `399 × 3 = 1197`, soit 11,97 €. `FacturationAdmin` somme ces flottants sur des centaines de lignes : le total « encaissé » divergera des relevés Stripe de plusieurs centimes, sans explication possible en comptabilité.

Correctif : stocker des entiers de centimes (`Int`) ou `Decimal @db.Decimal(10,2)`, convertir à l'affichage seulement. **À faire maintenant, avant qu'il y ait de vraies commandes.**

### 4.6 MOYEN — Fuseaux horaires et calcul dans le navigateur

[lib/analytics.ts:5](lib/analytics.ts#L5) mélange un `DAY = 86400000` fixe et un `startOfDay` en heure locale : aux changements d'heure, les tranches journalières du graphe se décalent et une commande peut être comptée le mauvais jour. Le calcul tourne de surcroît côté navigateur (`Overview.tsx`), donc **le CA affiché dépend du fuseau de la machine consultée**. Agréger côté serveur en `Europe/Paris`.

### 4.7 MOYEN — « Imprimer le ticket » imprime toute la page d'administration

[components/admin/OrdersAdmin.tsx:155](components/admin/OrdersAdmin.tsx#L155) appelle `window.print()` et aucune règle `@media print` n'existe dans `app/globals.css`. Le bouton produit la capture de la sidebar, des filtres et de toutes les commandes ouvertes, pas le ticket de cuisine annoncé dans la spec §7. Idem `InvoiceClient` : « Télécharger / Imprimer » ne génère aucun PDF, contrairement à la spec §5 (« facture PDF envoyée par email »).

---

## 5. Conformité légale — bloquant

Vérifié par recherche sur l'ensemble de `app/`, `components/` et `lib/` : **aucune page légale n'existe**, et le pied de page ne comporte aucun lien légal ([components/Footer.tsx:68-71](components/Footer.tsx#L68-L71)) — il expose en revanche publiquement un lien « Back-office » vers `/admin`, visible de tous les visiteurs et de tous les crawlers.

| Page à créer | Base légale | Contenu minimum |
| --- | --- | --- |
| **Mentions légales** | art. 6-III LCEN | Dénomination, forme juridique, adresse, **SIRET/RCS**, **n° TVA intracom**, téléphone, email, hébergeur (Vercel Inc. + adresse), responsable de publication |
| **CGV** | art. L221-5 et L111-1 C. conso | Prix TTC, frais par zone, minimum de commande, délais et zones, moyens de paiement, **exclusion du droit de rétractation**, réclamations, médiateur de la consommation (obligatoire, art. L612-1), droit applicable |
| **Politique de confidentialité** | art. 13 RGPD | Finalités, bases légales, durées de conservation, destinataires (Stripe, Resend, Neon, Vercel), droits et contact, réclamation CNIL |

**Le point le plus coûteux est la rétractation.** Les denrées périssables en sont exclues par l'art. L221-28 3° du Code de la consommation — mais cette exclusion n'est opposable **que si elle est écrite dans des CGV acceptées avant paiement**. En l'état, chaque client peut légalement exiger le remboursement d'un repas déjà livré et consommé.

**Les allergènes sont l'autre obligation dure.** Zéro occurrence de `allerg` dans le code ; le modèle `Dish` n'a aucun champ pour ça. Le règlement (UE) 1169/2011 (INCO), art. 9.1.c, 14 et 44, impose que les 14 allergènes majeurs soient disponibles **avant la conclusion de l'achat** en vente à distance. La carte est massivement concernée : arachide et fruits à coque dans le mafé, poisson et crustacés dans le tcheb et la dorade, gluten dans les sandwichs baguette et le couscous, sésame, soja dans les plats asiatiques, œuf et moutarde dans la mayonnaise maison, lait dans le degué et la panacotta. Le risque n'est pas seulement une amende DGCCRF, c'est une **responsabilité pénale en cas de choc anaphylactique**.

Correctif : créer `app/mentions-legales/`, `app/cgv/`, `app/confidentialite/`, les lier dans le footer, ajouter une case à cocher **non pré-cochée** « J'ai lu et j'accepte les CGV » bloquant le bouton Payer (art. 1127-1 C. civ. : le consentement doit être actif). Ajouter `allergens String @default("[]")` au modèle `Dish` + migration, l'exposer dans `PlatsAdmin` (cases à cocher sur les 14 allergènes réglementaires), l'afficher dans `DishModal`, et mettre une mention « Une question sur les allergènes ? Appelez-nous » sur la page Carte.

**Bandeau cookies : probablement inutile, ne pas l'ajouter par réflexe.** Vérifié — aucun traceur tiers dans le projet : pas de `gtag`, GTM, Google Analytics, Meta Pixel, Hotjar ni Matomo, aucun `<Script>` externe. `lib/analytics.ts` est trompeusement nommé, c'est de l'agrégation de KPIs pour le tableau de bord, pas du tracking. Les seuls stockages client sont le cookie de session NextAuth et le panier en `localStorage` : tous deux **strictement nécessaires au service demandé**, donc exemptés de consentement (art. 82 loi Informatique et Libertés, lignes directrices CNIL). Bon point également, les polices passent par `next/font/google` qui les auto-héberge au build — aucune requête du visiteur vers Google. La politique de confidentialité doit décrire ces deux stockages ; le bandeau ne deviendra obligatoire que si un jour un pixel ou un analytics tiers est ajouté.

---

## 6. Front-end

### 6.1 ÉLEVÉ — Aucun `next/image` : 5 Mo d'images sur `/carte`

Vérifié : **zéro import de `next/image`** dans tout le projet, et 11 balises `<img>` brutes, chacune accompagnée d'un `eslint-disable-next-line @next/next/no-img-element` pour faire taire l'avertissement.

Mesuré sur la sortie de build :

| Page | balises `<img>` | fichiers uniques | poids servi |
| --- | --- | --- | --- |
| `/` | 16 | 10 | **1 707 Ko** |
| `/carte` | 33 | 31 | **5 003 Ko** |

Les JPG de 100 à 285 Ko sont servis en pleine résolution dans des cartes de ~380 px, sans `width`/`height` (donc CLS à chaque image), sans `srcset`, sans WebP/AVIF, et l'image LCP du Hero n'a pas `priority`. `next.config.mjs` configure pourtant `images.remotePatterns` : l'optimiseur est configuré mais jamais utilisé.

Aggravant sur mobile — la cible principale d'après la spec : le collage du Hero est `hidden lg:block` mais ses trois `<img>` restent dans le DOM et sont **téléchargés par Chrome** (~590 Ko) sans jamais s'afficher.

Correctif : `<Image>` avec `fill` + `sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"`, `priority` sur la seule première image du Hero, recompression des sources, et rendu conditionnel du collage.

### 6.2 ÉLEVÉ — Modales et tiroir inutilisables au clavier

Vérifié : **zéro occurrence** de `role=`, `aria-modal`, `aria-expanded`, `aria-live`, `onKeyDown`, `Escape`, `focus()` ou `tabIndex` dans tout le projet.

- [components/DishModal.tsx:41-48](components/DishModal.tsx#L41-L48) : overlay `<div onClick={onClose}>`, sans `role="dialog"`, sans `aria-modal`, sans fermeture par Échap, sans piège à focus, sans restitution du focus, sans blocage du scroll de fond.
- [components/cart/CartDrawer.tsx:23-28](components/cart/CartDrawer.tsx#L23-L28) : le tiroir est **toujours monté** et seulement translaté hors écran. Ses boutons ± / supprimer et le lien « Commander » restent donc **focusables alors qu'ils sont invisibles** — un utilisateur clavier tabule dans un panier fantôme sur chaque page.
- `PlatsAdmin` → `DishEditor` : mêmes manques.

Les deux parcours clés — choisir les options d'un plat, gérer le panier — sont inutilisables au clavier et au lecteur d'écran. Non-conformité RGAA/WCAG 2.1 sur un site de vente.

### 6.3 ÉLEVÉ — Labels de formulaire non associés, sur la totalité des formulaires

Aucun couple `htmlFor`/`id` dans le projet : les `<label>` sont de simples voisins visuels (contact, checkout, compte, `PlatsAdmin`, `ZonesAdmin`, `LivraisonsAdmin`). Et certains champs n'ont **aucun** label, seulement un `placeholder` : `ZoneCheck`, la recherche de `MenuClient`, **tout le formulaire de connexion/inscription** ([AccountClient.tsx:135-160](components/account/AccountClient.tsx#L135-L160)), la recherche de `ClientsAdmin`.

Cliquer un libellé ne place pas le focus, un lecteur d'écran annonce « zone d'édition » sans nom, et le placeholder disparaît à la saisie — perte de repère, particulièrement sur l'adresse de livraison.

Correctif : `id` + `htmlFor` systématiques, ou envelopper l'input dans le `<label>`. Un composant `<Field>` partagé réglerait au passage la duplication de la chaîne de classes d'input, réécrite dix fois dans le projet.

### 6.4 ÉLEVÉ — Contrastes de la charte en échec WCAG AA

Ratios recalculés et vérifiés sur les valeurs de [app/globals.css:8-29](app/globals.css#L8-L29) :

| Couple | Ratio | Verdict | Où |
| --- | --- | --- | --- |
| `text-gold #f2b705` sur `bg-primary #e8732a` | **1,67** | échec total | le mot « des saveurs » **dans le `h1`** du Hero, et les titres de `/carte`, `/contact`, `/a-propos` |
| `text-primary` sur `bg-primary-soft` | **2,48** | échec | badge « Zone N », onglet actif du compte, statut « En cuisine » |
| `text-teal` sur `bg-page` | **2,46** | échec | tous les surtitres de section de l'accueil |
| `white` sur `bg-teal` | **2,95** | échec | boutons de `OrdersAdmin`, `LivraisonsAdmin` |
| `white` sur `bg-primary` | **3,04** | échec (15 px bold ≠ « large ») | **tous les CTA du site** |
| `text-ink-2 #856a50` sur `bg-page #f7e9d2` | **4,20** | échec (seuil 4,5) | couleur de **tout** le texte secondaire |

Le titre principal de la page d'accueil comporte donc un mot quasi illisible, et la couleur de corps de texte secondaire est sous le seuil partout.

Correctif : assombrir le primaire pour les fonds de bouton (≈ `#c85a15` donne 4,6:1 avec du blanc), remplacer `text-gold` sur `bg-primary` par du blanc ou l'encre foncée, foncer `ink-2` vers ≈ `#6f5540`, prévoir une variante foncée de `teal` pour le texte.

### 6.5 ÉLEVÉ — L'encart « Plat du jour » ne s'affichera jamais

[app/page.tsx:33-34](app/page.tsx#L33-L34) calcule `const today = JOURS[new Date().getDay()]`. Or `/` est **prérendue statiquement** et aucune page ne déclare `dynamic` ni `revalidate` (vérifié : zéro occurrence). Le `new Date()` est donc évalué **une seule fois, au build**. J'ai contrôlé le HTML généré : la chaîne « Plat du jour » en est **absente**.

Une fonctionnalité explicitement demandée (spec §4 et §3.9) et cochée ✅ dans `PROJECT-PLAN.md` est donc morte en production, sauf redéploiement quotidien. Même mécanisme pour l'année du copyright du footer.

Correctif : `export const revalidate = 3600` sur la page, ou calculer le jour dans un petit composant client, ou lire les plats du jour depuis la base en rendu dynamique.

### 6.6 ÉLEVÉ — SEO : tout l'appareillage est absent

Vérifié dans le HTML généré : aucun `og:`, aucun `canonical`, aucun `ld+json`.

- Pas de `metadataBase` → toute URL OG ou canonical future sera relative et cassée.
- **Pas un seul `openGraph`/`twitter`** dans le projet → aucun aperçu au partage WhatsApp, Facebook ou Instagram, qui est le canal numéro un d'un restaurant.
- **Pas de JSON-LD `Restaurant`/`LocalBusiness`** alors que toutes les données existent déjà dans [lib/menu.ts:62-79](lib/menu.ts#L62-L79) : nom, adresse, téléphone, horaires, moyens de paiement. Perte majeure en recherche locale.
- Pas de `sitemap.ts`, pas de `robots.ts`.
- **Aucune icône** : `public/` ne contient que `photos/`. Ni favicon, ni `app/icon.tsx`, ni `apple-icon`, ni `opengraph-image`.
- `/commande/[id]` et `/facture/[id]` n'ont aucune `metadata` et surtout **ne sont pas en `noindex`** alors qu'elles affichent des données personnelles et des factures.

Peu de code, fort effet pour un commerce local — à traiter juste après la sécurité.

### 6.7 MOYEN — Aucun `loading.tsx`, `error.tsx` ni `not-found.tsx`

Vérifié : zéro fichier de ce type dans `app/`. Toute exception dans un composant client produit un écran blanc sans recours, et la navigation vers `/compte` ou `/commande/[id]` affiche du vide puis un « Chargement… » rendu par le composant lui-même, après le coût du bundle.

### 6.8 MOYEN — Le layout racine est entièrement client, avec trois fetch en cascade partout

`SiteChrome` est `"use client"` uniquement pour lire `usePathname()` et masquer la nav sur `/admin`, et le layout empile quatre providers client. Nav, Footer et providers partent donc dans le bundle de **toutes** les routes, y compris `/a-propos` et `/contact` qui sont de la pure lecture. Trois requêtes (`DishesContext`, `OrdersContext`, `AuthContext`) sont déclenchées au montage sur chaque route, toutes vers des routes `force-dynamic` donc non cachées.

Correctif : route groups `app/(site)/layout.tsx` (Nav + Footer en Server Components) et `app/(admin)/layout.tsx` — `SiteChrome` disparaît. Data fetching serveur sur les pages qui en ont besoin, et `AuthContext` hydraté depuis la session lue dans le layout plutôt que par un aller-retour réseau.

### 6.9 MOYEN — Double source de vérité pour le catalogue

L'accueil lit le seed statique ([app/page.tsx:5](app/page.tsx#L5) : `items.filter(i => i.popular)`) tandis que `/carte` lit la base. Un plat passé « épuisé » ou dont le prix change dans l'admin reste donc faux **pour toujours** dans « Nos incontournables ». De plus le HTML prérendu de `/carte` contient les prix du seed puis les remplace après le fetch → flash de prix erronés, et **c'est cette version que Google indexe**.

### 6.10 Divers front

- **`alert()` comme seule remontée d'erreur du tunnel de commande** ([CheckoutClient.tsx:78](components/checkout/CheckoutClient.tsx#L78), [:99](components/checkout/CheckoutClient.tsx#L99)) : boîte native bloquante, parfois supprimée dans les navigateurs in-app (Instagram, Facebook) — l'utilisateur voit alors un bouton qui ne fait rien. Aucune zone `aria-live`.
- **Le formulaire de contact n'a pas de squelette** : `<form>` sans `onSubmit`, `<button type="button">` sans `onClick`, aucun champ avec `name`, `id` ou `required`. `PROJECT-PLAN.md` le marque ✅ « envoi Resend à brancher » — il n'y a rien à brancher, tout est à écrire.
- **Validation du tunnel très faible** : `valid` ne teste que la présence des champs. Un email `"a"` ou un téléphone `"x"` passe.
- **Le rail de catégories ment dès qu'on scrolle** : `activeCat` n'est mis à jour que par un clic, aucun `IntersectionObserver`, aucun `aria-current`. Sur dix catégories, la pastille reste sur « Entrées » pendant qu'on lit les desserts.
- **Onglets et filtres sans sémantique ARIA** : pas de `role="tablist"/"tab"/"tabpanel"`, pas d'`aria-selected`, pas d'`aria-pressed` sur les chips, pas d'`aria-expanded` sur le burger ni sur le bouton panier (dont le badge de quantité est purement visuel). Seul le `Toggle` de `PlatsAdmin` le fait correctement.
- **Valeur de contexte non mémoïsée** : [CartContext.tsx:111-123](components/cart/CartContext.tsx#L111-L123) recrée `value` à chaque render, et `open` en fait partie — ouvrir le panier re-render les ~60 `DishCard` de `/carte` pour rien.
- **Composant redéfini à chaque render** : `const SideLinks = () => …` déclaré dans le corps de `AdminShell` → remontage complet du sous-arbre de navigation à chaque render.
- **`Icon` non typé** : accepte `name: string` et retombe silencieusement sur `""`. Une faute de frappe rend un `<svg>` vide sans erreur, alors que les noms circulent en chaînes libres. Utiliser `keyof typeof ICONS`.
- **`any` à la frontière base/front** : [lib/serialize.ts:18,55,61,90](lib/serialize.ts#L18) et `lib/email.ts`. Les types Prisma sont générés et disponibles ; en l'état, aucun `Dish`/`Order` consommé par le front n'est vérifié par le compilateur.
- **`setTimeout` sans nettoyage** ([AccountClient.tsx:394](components/account/AccountClient.tsx#L394)), **assertions non-null** sur `user` et `dish.formules!` (correctes à l'exécution grâce à des gardes, mais fragiles), **icônes sociales mortes** (des `<span>` sans lien), **fichiers à découper** (`AccountClient` 413 lignes, `PlatsAdmin` 362, `CheckoutClient` 305).
- **Le changement d'email du profil est silencieusement ignoré** : le formulaire propose un champ Email éditable, l'envoie, et [app/api/auth/me/route.ts:25-30](app/api/auth/me/route.ts#L25-L30) le jette volontairement — tout en affichant « Enregistré ✓ ». Le client croit avoir changé son adresse de contact et ne recevra pas ses confirmations.

---

## 7. Modèle de données, outillage, tests

### 7.1 BLOQUANT — Le projet n'est pas versionné

Pas de `.git`, pas de `.github`, pas de `.husky`. Aucun historique, aucun retour arrière, aucune revue possible, aucune trace de ce qui a été livré à la cliente. Un `rm` malheureux ou un disque HS et tout est perdu.

**À faire dans cet ordre**, car les 29 Mo de fichiers morts resteraient sinon dans l'historique git à jamais :

| Chemin | Taille mesurée | Statut | Action |
| --- | --- | --- | --- |
| `scraps/` | **11,9 Mo** | captures de dev | supprimer |
| `uploads/` | **9,9 Mo** | jamais lu par le code | supprimer (archiver hors projet) |
| `assets/photos/` | **7,0 Mo** | **doublon exact de `public/photos/`** | supprimer — `lib/menu.ts` sert les photos depuis `/photos/` |
| 9 `*.jsx` + `data.js` + `styles.css` | ~130 Ko | maquettes pré-Next | déplacer dans `_maquettes/` hors build |
| 2 fichiers `Ô 3 Saveurs*.html` | 8,6 Ko | exports de maquette | supprimer |
| `.thumbnail` | 7 Ko | vignette parasite | supprimer |

Le fait que `tsconfig.json` doive exclure nommément onze fichiers de maquette est le symptôme : ils n'ont plus leur place à la racine.

Puis compléter `.gitignore` — il couvre bien `.env`, `.env*.local`, `*.tsbuildinfo`, `/.next/`, mais il manque `/uploads/`, `/scraps/`, `/assets/`, `.thumbnail`, `/coverage/`, `.vercel`. Ensuite `git init`, vérifier que `git status` ne contient **ni** `.env` **ni** `uploads/` **ni** `scraps/`, premier commit, dépôt GitHub **privé**.

### 7.2 ÉLEVÉ — `npm run lint` ne lint rien

ESLint n'est ni dans `devDependencies`, ni dans `node_modules` (vérifié : absent), et aucun `.eslintrc*` ou `eslint.config.*` n'existe. Le script `next lint` ouvre un prompt interactif de configuration au lieu d'analyser quoi que ce soit — en CI, il bloquerait le job jusqu'au timeout. Détail révélateur : `lib/email.ts` et `lib/serialize.ts` contiennent des directives `/* eslint-disable */` pour un linter qui n'a jamais tourné.

Correctif : `npm i -D eslint eslint-config-next`, créer `eslint.config.mjs` en flat config, et remplacer le script par `"lint": "eslint ."` — `next lint` disparaît en Next 16 et le projet est déjà en 15.5.19.

### 7.3 ÉLEVÉ — Les tests ne couvrent aucune logique critique

Les 27 tests passent, mais couvrent **uniquement des fonctions pures sans enjeu financier** :

| Fichier | Couvre | Valeur réelle |
| --- | --- | --- |
| `zones.test.ts` | `normalizeCity`, `findZoneForCity` | bonne, mais ne détecte pas le bug d'inclusion de §3.9 |
| `serialize.test.ts` | mappage DB ↔ domaine, JSON corrompu | bonne |
| `analytics.test.ts` | KPIs du tableau de bord | correcte, mais c'est de l'affichage |
| `menu.test.ts` | `fmtPrice` + invariants du catalogue statique | faible — valide des données de seed |
| `DishBadge.test.tsx` | un composant de 3 lignes | quasi nulle |

Non testé : les onze routes API, l'auth et le contrôle de rôle, le calcul du total, les `line_items` Stripe, le webhook, le panier, le minimum de commande. Autrement dit, **les quatre bloquants de ce rapport auraient tous été attrapés par les tests ci-dessous.**

Les cinq tests les plus rentables, dans l'ordre :

1. **`tests/pricing.test.ts`** — de loin le plus rentable. Il exige d'abord d'extraire `lib/pricing.ts` (`computeOrderTotal`), qui est de toute façon le correctif de §3.1. Vérifier : somme `unitPrice × qty` avec options et formules ; `fee = 0` en emporter ; `fee` de la zone en livraison ; rejet sous le minimum ; arrondi à 2 décimales ; **rejet d'un `unitPrice` négatif ou divergent du prix en base**.
2. **`tests/api-auth.test.ts`** — pour chaque couple (route, méthode) de mutation : **403 sans session**, **403 en session CLIENT**, **200 en session ADMIN**. Table de cas paramétrée avec `vi.mock("@/auth")`. Verrouille §2.3 et empêche toute route future d'être ajoutée sans garde.
3. **`tests/webhook-stripe.test.ts`** — signature invalide → 400 **sans aucune écriture** ; événement valide → `paid: true` + un seul email ; `metadata.orderId` absent → pas de crash ; **rejeu du même événement → pas de second email** ; échec Prisma → 500 pour déclencher le retry Stripe.
4. **`tests/api-orders-scope.test.ts`** — un client A ne peut jamais lire les commandes d'un client B ; `?email=victime@x.fr` est ignoré au profit de l'email de session ; sans session → 401. C'est le test de non-régression de §2.1, celui qui a une valeur juridique.
5. **`tests/cart.test.tsx`** — `renderHook` sur `CartProvider` : fusion des lignes de même clé, non-fusion quand les options diffèrent, `setQty(0)` supprime, `subtotal` après retrait, persistance `localStorage`, et résistance à un `localStorage` corrompu.

Ajouter `@vitest/coverage-v8` et un script `test:cov` pour mesurer la progression.

### 7.4 ÉLEVÉ — Aucune CI, et `next-auth` en beta non figée

Rien ne garantit qu'un commit compile : `tsc --noEmit` n'est jamais lancé (le script n'existe même pas) et `next build` ne typecheck que les fichiers atteints par le graphe de modules. Quinze lignes de YAML (`npm ci` → `tsc --noEmit` → `lint` → `test`) auraient attrapé les incohérences de documentation de §7.6.

`package.json` déclare `"next-auth": "^5.0.0-beta.31"`. Auth.js v5 est en beta depuis plus de deux ans et **casse régulièrement son API entre betas** (signature de `authorized`, forme des callbacks). Le `^` autorise npm à installer une beta plus récente : sur un rebuild Vercel, l'authentification **et** le contrôle d'accès admin peuvent casser sans qu'une ligne de code ait changé. À figer sans `^`.

Toutes les dépendances sont en `^`, avec un écart déjà constaté (`^15.1.6` → 15.5.19 installé). `package-lock.json` existe mais n'est pas versionné : rien ne rend les builds reproductibles aujourd'hui. Le committer et utiliser `npm ci`.

**Bon point** : aucun paquet inutilisé et aucun paquet manquant. `recharts`, `@vercel/blob`, `resend`, `stripe` et `bcryptjs` sont tous réellement importés. Le seul manque est ESLint.

### 7.5 MOYEN — `tsconfig` strict mais sans garde-fou d'indexation

`"strict": true` ✅, mais `noUncheckedIndexedAccess` est absent — et c'est le plus pertinent ici, car le code indexe des tableaux sans vérification à des endroits sensibles. Le plus grave : [CheckoutClient.tsx:39-40](components/checkout/CheckoutClient.tsx#L39-L40) fait `zones[zoneIdx].fee` — si `zoneIdx` sort des bornes, **crash à l'exécution sur la page de paiement**. Aussi `zones[i].villes`, `mail.split("@")[0]`.

Activer `noUncheckedIndexedAccess`, corriger la dizaine d'erreurs remontées, et brancher `tsc --noEmit` dans la CI.

### 7.6 MOYEN — Documentation périmée, et une variable d'environnement fantôme

J'ai extrait tous les `process.env.*` réellement lus et comparé au tableau de `DEPLOY.md` : tout correspond, **sauf `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`**, documentée deux fois et présente dans `.env.example` mais **jamais lue par le code**. C'est un vestige : le paiement passe par Stripe Checkout hébergé, qui n'utilise aucune clé publique côté client. La faire renseigner à la cliente entretient la confusion — à retirer.

`README.md` décrit un projet qui n'existe plus, et **ses commandes de démarrage échouent en l'état** : il annonce « Prisma · SQLite », `DATABASE_URL="file:./dev.db"` et `npm run db:migrate` alors que le provider est `postgresql` ; il présente « Auth0 à brancher », « Stripe : brancher le paiement réel » et « Resend : point TODO » alors que les trois sont faits. `PROJECT-PLAN.md`, daté du 8 juin 2026, affiche encore « ⛔ Stripe », « ⛔ Resend » et revendique des tests « API » qui n'existent pas. Un README faux coûte des heures à la reprise du projet.

### 7.7 MOYEN — Modèle de données

- **Aucun index** sur les colonnes réellement filtrées et triées. La migration ne crée que les quatre index d'unicité. Manquent `Order.createdAt` (tri de **toutes** les requêtes), `Order.customerEmail`, `Order.status`, `Order.stripeSessionId`, et `Dish.cat`/`position`. Combiné à `GET /api/orders` qui renvoie la table entière sans pagination à chaque chargement de page, le site ralentira puis saturera le pooler Neon. Ajouter `@@index([createdAt])`, `@@index([status, createdAt])`, `@@index([customerEmail])`, `@@index([stripeSessionId])`, `@@index([cat, position])`.
- **`userEmail` est écrit mais jamais lu** : le rattachement effectif se fait sur `customerEmail`. Un client connecté qui saisit une autre adresse au checkout ne verra jamais sa commande dans « Mes commandes ». À remplacer par une vraie relation `userId String?` + `@relation` avec `onDelete: SetNull` — aucune relation ni `onDelete` n'existe aujourd'hui dans le schéma.
- **`DailySpecial` est un modèle mort** : peuplé par le seed, lu par personne. La page d'accueil utilise `platsDuJour` en dur, qui ne couvre que mercredi, jeudi et vendredi. Laila ne peut pas changer son plat du jour.
- **Colonnes JSON en `String`** : héritage SQLite qui n'a plus de raison d'être. Postgres offre `jsonb`, qui **valide la structure à l'écriture** — ce que `TEXT` ne fait pas. Le commentaire d'en-tête de [lib/serialize.ts:1](lib/serialize.ts#L1) parle d'ailleurs encore de SQLite.
- **Une ligne `lines` corrompue produit une commande à 0 article mais facturée** : `parse()` renvoie `[]` en silence. C'est le bon choix pour les `tags` d'un plat, le mauvais pour les lignes d'une commande — préférer un marquage explicite (`status: "corrompue"`).
- **Enums manquants** : `mode`, `status`, `role`, `paymentMethod` sont des `String` libres. `status` est validé dans le PATCH, `mode` ne l'est nulle part.
- **Ordre du catalogue non modifiable** : `position` est fixé à la création mais `dishToRow` ne le gère pas et `rowToDish` ne l'expose pas.
- **`db:push` reste exposé** dans `package.json` : tout usage futur introduirait une dérive schéma/migration. À supprimer ou documenter comme interdit hors dev jetable.

### 7.8 MOYEN — Étapes de production manquantes

`DEPLOY.md` est bien écrit et exact sur la configuration des services, mais il s'arrête au premier déploiement réussi. Manquent :

- **Health check** : aucune route `/api/health`, donc aucun uptime monitor branchable.
- **Monitoring d'erreurs** : pas de Sentry. Les neuf `console.error` du code partent dans les logs Vercel, **retenus une heure en plan Hobby**. Un paiement échoué la nuit sera invisible au matin.
- **Sauvegardes** : le plan Neon gratuit offre 24 h d'historique — insuffisant pour de la comptabilité, dont la conservation est de 10 ans (art. L123-22 C. com.).
- **Rétention RGPD** : aucune politique de purge ou d'anonymisation des données clients (art. 5.1.e).
- **Rollback** : aucune procédure.

### 7.9 FAIBLE — Ni Prettier ni hooks pre-commit

Le style est en réalité très homogène (guillemets doubles, points-virgules, deux espaces) : c'est du formatage manuel discipliné, mais rien ne le garantit. Faible priorité en mono-développeur. À faire **après** ESLint, sinon le premier passage de Prettier créera un diff massif qui noiera l'historique naissant.

---

## 8. Écarts avec la spec et le plan

Les deux documents sont globalement honnêtes sur les intégrations bloquées. Les écarts réels portent sur des points cochés ✅.

### Annoncé fait, absent en réalité

- **Choix de l'accompagnement des grillades** (spec §3.5) : les quatre grillades de `lib/menu.ts` n'ont **aucune** entrée `options`. L'accompagnement n'existe que dans la description — le client paie sans jamais pouvoir choisir.
- **Plats du jour pilotables depuis l'admin** (spec §3.9 et §7) : constante en dur, aucun écran d'administration — et l'encart est de toute façon figé au build (§6.5).
- **Édition complète des plats** (spec §7 : « options, stock ») : `DishEditor` ne permet d'éditer ni `options`, ni `formules`, ni `tags`, ni `spice`, ni le stock. Ces champs sont conservés mais inaccessibles.
- **Gestion des livreurs** (spec §7) : `LivraisonsAdmin` importe `DRIVERS` depuis `lib/mockOrders.ts` — Laila ne peut affecter que Samir, Kevin, Dramane et Élodie. À remplacer par une table `Driver`.
- **Apple Pay / Google Pay** (spec §5) : proposés comme options mais les trois moyens non-espèces empruntent le même Stripe Checkout standard. Le choix de l'utilisateur n'a **aucun** effet — l'interface est trompeuse.
- **Facture PDF par email** (spec §5) : le bouton « Télécharger / Imprimer » ne génère aucun PDF.

### Écarts de carte, à arbitrer avec la cliente

La spec §10 en fait explicitement des points à valider :

- Prix « à définir » **inventés** : Jus d'Avocat 4 €, Jus d'Orange 3,50 €.
- Prix divergents : dorade entière 16 € en spec → **18 €** dans le code ; jus « 33 cl » en spec → « 50 cl ».
- Plats remplacés silencieusement : le tajine agneau/petits pois est devenu « Tajine Poulet aux Légumes », le tajine poulet/olive/frites « Tajine Boulettes de Bœuf ». Les brochettes brebis et agneau ont disparu au profit d'une brochette bœuf, et passent de 3 à 2 pièces.
- Sauces : la spec annonce « mayonnaise maison ou piment maison » ; le code propose « Sauce Niamey / Piment maison / Sriracha » — pas de mayonnaise.
- Une catégorie entière hors spec a été ajoutée (« Salades & Bowls », 6 plats), plus Kefta, Merguez, Cocktail Maison, Sauce verte et Canette.

---

## 9. Points vérifiés et sains

Contrôlés explicitement — utile de le savoir pour ne pas les retoucher :

- **Aucune fuite du hash de mot de passe.** `rowToUser` ([lib/serialize.ts:90-98](lib/serialize.ts#L90-L98)) ne projette que `name`, `email`, `phone`, `addresses`, `favorites`. Aucun `select`/`include` du projet ne remonte `password`.
- **Pas de mass assignment sur le rôle.** `register` force `role: "CLIENT"` en dur ; `PATCH /api/auth/me` recopie champ par champ sans `role`, `email` ni `password`. `dishToRow` est aussi une liste blanche.
- **Pas d'injection SQL.** Tout passe par Prisma paramétré, aucun `$queryRaw` dans le projet.
- **Signature du webhook Stripe correctement vérifiée** : corps brut, `constructEvent`, rejet 400 si secret ou signature manquants.
- **`/api/upload` est correctement protégé** : rôle ADMIN, liste blanche MIME, 5 Mo max, `addRandomSuffix: true` qui neutralise l'écrasement et la traversée de chemin, préfixe fixe `dishes/`. Un SVG renommé est refusé. Réserve mineure : `file.type` est déclaré par le client, sans contrôle des octets d'en-tête.
- **`JSON.parse` est toujours gardé** par le helper `parse()` avec fallback.
- **`lib/prisma.ts`** : singleton correct, logs limités à `error` en production.
- **`.env` sans fuite** : uniquement des placeholders, couvert par `.gitignore`. Le code gère proprement ces placeholders (`lib/stripe.ts` et `lib/email.ts` testent `.includes("placeholder")` pour basculer en mode démo) — c'est astucieux, hors du cas de production de §3.5.
- **Schéma Prisma et migration SQL parfaitement cohérents** : cinq modèles comparés ligne à ligne, types, défauts, nullabilité et les quatre index d'unicité. Aucune dérive.
- **`next@15.5.19`** : au-delà du correctif de CVE-2025-29927.
- **Polices auto-hébergées** via `next/font/google` — aucune requête du visiteur vers Google, ce qui évite le problème RGPD classique des Google Fonts.

---

## 10. Plan d'action

### Phase 1 — avant tout encaissement réel

1. Nettoyer les 29 Mo morts, `git init`, `.gitignore` complété, dépôt privé (§7.1).
2. Gardes ADMIN sur les routes de mutation (§2.3), cloisonnement de `GET /api/orders` et `orders/[id]` (§2.1, §2.2), sortir `OrdersProvider` du layout racine.
3. Extraire `lib/pricing.ts` et recalculer tous les montants côté serveur (§3.1) — avec les zones lues en base (§3.9).
4. Supprimer le repli « payé » hors dev (§3.5), l'auto-avancement du statut (§3.3) et les mentions « paiement simulé » (§3.2).
5. Écrire les tests 1 et 2 (§7.3) — ils verrouillent les étapes 2 et 3.

### Phase 2 — avant mise en service opérationnelle

1. Seed non destructif + purge des commandes de démo (§3.4).
2. Statut `en_attente_paiement`, panier préservé, badge « Non payée » (§3.7) ; fiabiliser le webhook (§3.6) et le cas d'erreur Stripe (§3.8).
3. Facture : mention TVA, ventilation HT/TVA/TTC, numérotation séquentielle, `paid` réellement consulté (§4.1 à §4.3).
4. Zones et horaires vérifiés côté serveur (§3.9, §3.10) ; montants en centimes (§4.5) — **avant** d'avoir de vraies données.
5. Trois pages légales + case CGV, et allergènes en base et à l'écran (§5).

### Phase 3 — avant d'ouvrir les vannes

1. `next/image` et recompression des photos (§6.1) — le plus gros gain mobile.
2. Accessibilité : focus et Échap sur les modales et le tiroir, labels associés, palette corrigée (§6.2 à §6.4).
3. SEO : `metadataBase`, `openGraph`, JSON-LD `Restaurant`, `sitemap`, `robots`, icônes, `noindex` sur commande et facture (§6.6).
4. ESLint réel (§7.2), CI (§7.4), Sentry + health check + sauvegardes (§7.8), figer `next-auth` (§7.4), README et DEPLOY à jour (§7.6), index Prisma et pagination (§7.7).
5. Débloquer le plat du jour (§6.5), unifier la source du catalogue (§6.9), `error.tsx`/`not-found.tsx`/`loading.tsx` (§6.7).

### À trancher avec la cliente, sans attendre

- Informations légales de l'entreprise : SIRET, forme juridique, n° TVA, adresse du siège.
- Régime de TVA réel, à confirmer avec son comptable.
- Saisie des allergènes plat par plat — une session de travail à prévoir.
- Les écarts de carte du §8 : prix inventés, plats substitués, catégorie ajoutée.
- Les points restés ouverts de la spec §10 : prix définitifs, zones et frais réels, horaires, logo.
