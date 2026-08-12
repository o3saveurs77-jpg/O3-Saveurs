/* Validation des champs d'un plat, partagée par les routes de création et de
 * mise à jour.
 *
 * Vit dans `lib/` et non dans le fichier de route : Next.js n'autorise que des
 * exports connus (`GET`, `POST`, `dynamic`, …) dans un Route Handler, et un
 * export supplémentaire fait échouer la vérification de types du build.
 */

import { int, bool, stringArray, type Result } from "@/lib/validate";
import { ALLERGENS, type Allergen } from "@/lib/types";
import type { Dish } from "@/lib/menu";

/** Valide et normalise les champs numériques, les tags et les allergènes. */
export function validateDishFields(body: Partial<Dish>): Result<Partial<Dish>> {
  const out: Partial<Dish> = {};

  if (body.priceCents === null) {
    out.priceCents = null;
  } else if (body.priceCents !== undefined) {
    const v = int(body.priceCents, "Le prix", { min: 0, max: 1_000_00 });
    if (!v.ok) return v;
    out.priceCents = v.value;
  }

  if (body.costCents === null) {
    out.costCents = null;
  } else if (body.costCents !== undefined) {
    const v = int(body.costCents, "Le coût matière", { min: 0, max: 1_000_00 });
    if (!v.ok) return v;
    out.costCents = v.value;
  }

  if (body.stock === null) {
    out.stock = null;
  } else if (body.stock !== undefined) {
    const v = int(body.stock, "Le stock", { min: 0, max: 10_000 });
    if (!v.ok) return v;
    out.stock = v.value;
  }

  if (body.stockAlert === null) {
    out.stockAlert = null;
  } else if (body.stockAlert !== undefined) {
    const v = int(body.stockAlert, "Le seuil d'alerte", { min: 0, max: 10_000 });
    if (!v.ok) return v;
    out.stockAlert = v.value;
  }

  if (body.spice !== undefined) {
    const v = int(body.spice, "Le niveau de piment", { min: 0, max: 3 });
    if (!v.ok) return v;
    out.spice = v.value;
  }

  if (body.position !== undefined) {
    const v = int(body.position, "La position", { min: 0, max: 999 });
    if (!v.ok) return v;
    out.position = v.value;
  }

  /* Délai de préparation. Le plafond de 30 jours n'est pas décoratif : c'est
   * l'horizon que `preorderDays` explore pour proposer des dates. Au-delà, la
   * cliente enregistrerait un plat qu'aucune date ne pourrait plus servir. */
  if (body.leadTimeHours !== undefined) {
    const v = int(body.leadTimeHours, "Le délai de préparation", { min: 0, max: 24 * 30 });
    if (!v.ok) return v;
    out.leadTimeHours = v.value;
  }

  if (body.tags !== undefined) {
    const v = stringArray(body.tags, "Les tags", { maxItems: 12, maxLen: 40 });
    if (!v.ok) return v;
    out.tags = v.value;
  }

  if (body.allergens !== undefined) {
    const v = stringArray(body.allergens, "Les allergènes", { maxItems: 14, maxLen: 30 });
    if (!v.ok) return v;
    const unknown = v.value.find((a) => !(ALLERGENS as readonly string[]).includes(a));
    if (unknown) return { ok: false, error: `Allergène inconnu : ${unknown}` };
    out.allergens = v.value as Allergen[];
  }

  if (body.popular !== undefined) out.popular = bool(body.popular);
  if (body.available !== undefined) out.available = bool(body.available);
  if (body.badge !== undefined) out.badge = body.badge;
  if (body.photo !== undefined) out.photo = body.photo;
  if (body.options !== undefined) out.options = body.options;
  if (body.formules !== undefined) out.formules = body.formules;

  return { ok: true, value: out };
}
