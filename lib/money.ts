/* Argent — tout est en centimes entiers.
 *
 * Raison : en binaire flottant, 3 × 3.99 donne 11.969999999999999. Stocké tel
 * quel, ce sous-total diverge du montant réellement facturé par Stripe
 * (399 × 3 = 1197), et la somme de centaines de lignes finit par ne plus
 * correspondre aux relevés — impossible à justifier en comptabilité.
 *
 * Règle : les centimes circulent partout (base, API, calculs) ; l'euro
 * n'apparaît qu'au formatage pour l'affichage, et à la frontière Stripe qui
 * attend elle-même des centimes.
 */

/** TVA restauration / vente à emporter : 10 % (art. 279 m CGI), en points de base. */
export const VAT_RATE_BP = 1000;

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/** Formate des centimes pour l'affichage : 1197 → « 11,97 € ». */
export function fmtCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return eur.format(cents / 100);
}

/** Variante compacte sans symbole : 1197 → « 11,97 ». */
export function fmtCentsPlain(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Euros (saisie admin) → centimes. `"11,97"`, `"11.97"` et `11.97` acceptés. */
export function toCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Centimes → euros, pour préremplir un champ de saisie. */
export function toEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Applique un pourcentage à des centimes, arrondi au centime le plus proche. */
export function applyPercent(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/**
 * Ventilation TVA d'un montant TTC, obligatoire sur la facture
 * (art. 242 nonies A CGI). `rateBp` en points de base : 1000 = 10 %.
 */
export function vatBreakdown(totalCents: number, rateBp: number = VAT_RATE_BP) {
  const net = Math.round((totalCents * 10000) / (10000 + rateBp));
  return { netCents: net, vatCents: totalCents - net, grossCents: totalCents, rateBp };
}

/** « 10 % » à partir de points de base, pour l'affichage. */
export function fmtVatRate(rateBp: number = VAT_RATE_BP): string {
  return `${(rateBp / 100).toFixed(rateBp % 100 === 0 ? 0 : 1).replace(".", ",")} %`;
}

/**
 * `FACT-2026-000142` — présentation d'un numéro de facture séquentiel.
 *
 * Défini ici et non dans `lib/ref.ts` : ce module est pur, alors que `ref.ts`
 * importe Prisma et `node:crypto` pour *attribuer* les numéros. Les composants
 * client qui affichent une facture ne doivent pas tirer la base dans le bundle
 * du navigateur.
 */
export function formatInvoiceNumber(n: number | null, at: Date = new Date()): string {
  if (n === null) return "—";
  return `FACT-${at.getFullYear()}-${String(n).padStart(6, "0")}`;
}

/** Garde-fou : un montant monétaire doit être un entier positif raisonnable. */
export function isValidCents(v: unknown, { max = 100_000_00 } = {}): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}
