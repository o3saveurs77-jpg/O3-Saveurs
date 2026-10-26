/* Mise en forme de l'adresse du restaurant — **module pur**, sans accès à la
 * base ni à aucun service.
 *
 * Cette fonction vivait dans `lib/settings.ts`, qui ouvre Prisma et tire
 * `lib/geo.ts` (marqué `server-only`). Depuis que la page de facture affiche
 * l'identité du vendeur côté navigateur, `components/invoice/InvoiceClient.tsx`
 * importait `lib/invoice.ts`, qui importait `formatAddress` depuis
 * `lib/settings.ts` : la compilation s'arrêtait sur « You're importing a
 * component that needs "server-only" », pour une fonction qui ne fait
 * qu'assembler trois chaînes.
 *
 * Même motif que `formatInvoiceNumber`, hébergé dans `lib/money.ts` (pur) et
 * réexporté par `lib/ref.ts` (qui, lui, importe Prisma) : le calcul pur vit
 * dans un module que les deux côtés peuvent charger, et le module serveur le
 * réexporte pour ne casser aucun import existant.
 */

/** Ce dont la mise en forme a besoin, et rien de plus. */
export interface AdressePostale {
  "restaurant.address"?: string;
  "restaurant.zip"?: string;
  "restaurant.city"?: string;
}

/**
 * Adresse postale sur une ligne : « 38 rue des Prés Saint-Martin, 77340
 * Pontault-Combault ».
 *
 * Les parties vides sont omises plutôt que de laisser une virgule orpheline ou
 * un code postal seul, et les espaces en double sont resserrés : ces valeurs
 * sont saisies à la main dans le back-office, et elles finissent sur une
 * facture et dans le balisage envoyé à Google.
 */
export function formatAddress(s: AdressePostale): string {
  const rue = (s["restaurant.address"] ?? "").trim();
  const ville = `${s["restaurant.zip"] ?? ""} ${s["restaurant.city"] ?? ""}`.trim();
  return [rue, ville]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ");
}
