# Conventions du projet

À lire avant d'écrire du code. Ces règles sont ce qui empêche de recréer les
problèmes listés dans [AUDIT.md](AUDIT.md).

## 1. L'argent est en centimes entiers

Jamais de flottant pour un montant : `3 × 3.99` donne `11.969999999999999`, ce
qui fait diverger la comptabilité des relevés Stripe.

| Type | Champs |
| --- | --- |
| `Dish` | `priceCents`, `costCents` |
| `Zone` | `feeCents`, `minimumCents` |
| `Order` | `subtotalCents`, `discountCents`, `feeCents`, `totalCents` |
| `OrderLine` | `unitPriceCents`, `lineTotalCents` |
| `CartLine` | `unitPriceCents` (affichage seul — le serveur recalcule) |

Helpers dans [lib/money.ts](lib/money.ts) :

- `fmtCents(cents)` → « 11,97 € ». Réexporté sous le nom `fmtPrice` par
  `@/lib/menu`, pour que les composants gardent leur import habituel.
- `toCents("11,97")` → `1197` — pour lire un champ de saisie admin.
- `toEuros(1197)` → `"11,97"` — pour préremplir un champ.
- `vatBreakdown(total, rateBp)` → `{ netCents, vatCents, grossCents }`.
- `applyPercent(cents, percent)`.

## 2. Aucun montant ne vient du navigateur

Le client envoie **ce qu'il commande** (`dishId`, `qty`, `opts`, `formule`) et
**où** (`zip`, `city`). Tout le reste est relu en base par
[lib/pricing.ts](lib/pricing.ts) → `computeOrder()` : prix des plats, frais de
zone, minimum de commande, remise promotionnelle, total.

Ne jamais ajouter un champ `price`, `subtotal`, `fee` ou `total` à un corps de
requête entrant. C'est la faille qui permettait d'encaisser 80 € à 1 centime.

De même : la zone de livraison est **déduite du code postal** côté serveur, elle
n'est pas choisie par le client.

## 3. Autorisation dans chaque handler

Le middleware ne protège que les *pages* `/admin`. Il ne couvre **aucune** route
`/api/*`. Chaque handler qui écrit, ou qui lit des données non publiques, appelle
un garde de [lib/guard.ts](lib/guard.ts) :

```ts
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  // guard.user.email est disponible
}
```

- `requireAdmin()` — réservé à l'administration.
- `requireUser()` — tout compte connecté.
- `optionalUser()` — session éventuelle (commande en invité).
- `canAccess(user, ownerEmail)` — un client ne voit que ses données.
- `readJson<T>(req)` — renvoie `null` sur corps malformé, au lieu d'une 500.
- `badRequest` / `notFound` / `conflict` / `serverError`.

Pour une ressource appartenant à un tiers, répondre **404 plutôt que 403** : ne
pas confirmer son existence.

## 4. Valider les entrées

Pas de `as Body` : un cast ne garantit rien à l'exécution. Utiliser
[lib/validate.ts](lib/validate.ts) :

```ts
const fields = collect({
  name: str(body.name, "Le nom", { min: 2, max: 80 }),
  email: email(body.email),
  qty: int(body.qty, "La quantité", { min: 1, max: 50 }),
  mode: oneOf(body.mode, ["livraison", "emporter"] as const, "Le mode"),
});
if (!fields.ok) return badRequest(fields.error);
```

`escapeHtml()` est **obligatoire** avant toute interpolation dans un email : les
noms de clients y arrivaient bruts, ce qui permettait d'envoyer un lien de
phishing depuis le domaine du restaurant.

## 5. Un fichier de route n'exporte que des handlers

Next.js n'autorise que `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `dynamic`,
`revalidate`… Un export supplémentaire fait échouer la vérification de types du
build. Les helpers partagés vont dans `lib/`.

## 6. La base est la seule source de vérité

`lib/menu.ts` contient les **types applicatifs** (montants en centimes) et les
**données de seed** (`items`, `zones`, `platsDuJour`, en euros, type `SeedDish`).
Les données de seed ne sont lues que par `prisma/seed.ts`. Un composant qui
affiche `items` au lieu de la base montre des prix qui ne changeront jamais —
c'est le bug de l'accueil relevé à l'audit §6.9.

## 7. Statuts de commande

Six statuts, dont `en_attente_paiement` (nouveau) : une commande n'entre en
cuisine qu'une fois le paiement acquis. Les transitions passent par
`STATUS_NEXT` de [lib/types.ts](lib/types.ts) — on ne revient pas d'une commande
livrée à « en cuisine ». Chaque étape est horodatée dans `Order.timeline`.

Le client ne fait **jamais** avancer un statut : c'était le cas avant, la page de
suivi écrivait en base toutes les 12 secondes.

## 8. Formes d'API

- `GET /api/orders` → `{ orders, total, take, skip }` (et non un tableau), avec
  authentification obligatoire et cloisonnement par session.
- `GET /api/dishes` → `Dish[]`, publique.
- `GET /api/zones` → `Zone[]`, publique.

## 9. Interface

- Textes en français, commentaires en français.
- Tailwind v4 avec les variables du thème : `bg-page`, `bg-panel`, `bg-panel-2`,
  `border-line`, `text-ink`, `text-ink-2`, `text-primary`, `text-brick`,
  `text-teal`, `rounded-xl`, `rounded-full`.
- `Icon` : le nom est typé (`IconName`), une faute de frappe est une erreur de
  compilation. Ajouter l'icône à `ICONS` si elle manque.
- Accessibilité : `id` + `htmlFor` sur tout champ, `aria-current` sur l'onglet
  actif, `aria-expanded` sur un bouton qui ouvre quelque chose. Pas de `alert()`
  pour remonter une erreur — un message dans une zone `aria-live`.
- Pas de `<img>` : `next/image`.

## 10. Vérifier avant de conclure

```
npm run typecheck    # tsc --noEmit
npm test
npm run build
```
