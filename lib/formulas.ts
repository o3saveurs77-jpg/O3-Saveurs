/* Formules — composition, sérialisation et **tarification serveur**.
 *
 * Une formule est un prix fixe et une liste de créneaux (« votre entrée »,
 * « votre plat »…). Le client choisit un plat par créneau ; le serveur facture
 * le prix de la formule plus les suppléments — celui du plat retenu, et ceux de
 * ses options.
 *
 * Comme pour `lib/pricing.ts`, **aucun montant venu du navigateur n'est
 * utilisé** : le client transmet des identifiants (formule, créneau, plat), et
 * tout le reste est relu en base. Une formule à 10,90 € ne peut pas être
 * encaissée à 1 centime, et un plat à 18 € ne peut pas se glisser dans un
 * créneau où la cliente ne l'a pas autorisé.
 */

import type {
  Formula as FormulaRow,
  FormulaSlot as SlotRow,
  FormulaChoice as ChoiceRow,
  Dish as DishRow,
} from "@prisma/client";

import type { Dish, Formula } from "@/lib/menu";
import { isOrderable } from "@/lib/menu";
import { rowToDish } from "@/lib/serialize";
import type { FormulaPick } from "@/lib/types";
import { fmtCents } from "@/lib/money";
import { err, ok, type Result } from "@/lib/validate";

/** Ligne Prisma complète, telle que chargée par `loadFormulas`. */
export type FormulaRowFull = FormulaRow & {
  slots: (SlotRow & { choices: (ChoiceRow & { dish?: DishRow | null })[] })[];
};

export function rowToFormula(r: FormulaRowFull): Formula {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    desc: r.desc,
    extra: r.extra,
    priceCents: r.priceCents,
    active: r.active,
    position: r.position,
    slots: [...r.slots]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        label: s.label,
        required: s.required,
        position: s.position,
        choices: [...s.choices]
          .sort((a, b) => a.position - b.position)
          .map((c) => ({
            id: c.id,
            dishId: c.dishId,
            supplementCents: c.supplementCents,
            position: c.position,
            dish: c.dish ? rowToDish(c.dish) : undefined,
          })),
      })),
  };
}

/**
 * Ce que le client est autorisé à choisir dans une formule : un plat par
 * créneau, et les options de ce plat. Aucun montant.
 */
export interface RawPick {
  slotId: string;
  dishId: string;
  opts?: Record<string, string>;
}

export interface PricedFormula {
  /** prix unitaire de la formule garnie, en centimes */
  unitPriceCents: number;
  picks: FormulaPick[];
  /** récapitulatif « Votre plat » → « Thiéboudiène Poisson (+4,00 €) » */
  opts: Record<string, string>;
}

/**
 * Valorise une formule garnie.
 *
 * Refuse — et explique pourquoi — un créneau obligatoire vide, un plat absent
 * de la liste autorisée, un plat épuisé, une option obligatoire non choisie.
 * Les plats sont fournis par l'appelant (déjà relus en base) pour que la
 * fonction reste pure et testable.
 */
export function priceFormula(
  formula: Formula,
  raw: RawPick[],
  dishById: Map<string, Dish>,
): Result<PricedFormula> {
  if (!formula.active) return err(`La formule « ${formula.name} » n'est plus proposée`);

  const bySlot = new Map(raw.map((p) => [p.slotId, p]));
  let total = formula.priceCents;
  const picks: FormulaPick[] = [];
  const opts: Record<string, string> = {};

  for (const slot of formula.slots) {
    const chosen = bySlot.get(slot.id);

    if (!chosen || !chosen.dishId) {
      if (slot.required) return err(`Choisissez « ${slot.label} » pour la formule ${formula.name}`);
      continue;
    }

    const choice = slot.choices.find((c) => c.dishId === chosen.dishId);
    if (!choice) return err(`Ce plat n'est pas proposé dans « ${slot.label} »`);

    const dish = dishById.get(chosen.dishId);
    if (!dish) return err("Un plat de votre formule n'existe plus");
    if (!dish.available) return err(`« ${dish.name} » n'est plus disponible`);
    if (dish.stock !== null && dish.stock <= 0) return err(`« ${dish.name} » est épuisé`);

    // Options du plat retenu (riz, sauce…) : mêmes règles qu'à la carte.
    let optionExtras = 0;
    const chosenOpts: Record<string, string> = {};
    for (const option of dish.options) {
      const value = chosen.opts?.[option.name];
      if (!value) {
        if (option.required) return err(`Choisissez « ${option.name} » pour « ${dish.name} »`);
        continue;
      }
      const match = option.choices.find((c) => c.l === value);
      if (!match) return err(`Choix « ${value} » invalide pour « ${option.name} »`);
      optionExtras += match.priceCents ?? 0;
      chosenOpts[option.name] = value;
    }

    const supplement = choice.supplementCents + optionExtras;
    total += supplement;

    picks.push({
      slotId: slot.id,
      slotLabel: slot.label,
      dishId: dish.id,
      dishName: dish.name,
      supplementCents: supplement,
      opts: chosenOpts,
    });

    // Récapitulatif lisible, réutilisé tel quel par le panier, les emails, le
    // ticket de cuisine et la facture — d'où le formatage ici plutôt que dans
    // chacun de ces écrans.
    opts[slot.label] = describePick(dish.name, chosenOpts, supplement);
  }

  return ok({ unitPriceCents: total, picks, opts });
}

/** « Thiéboudiène Poisson · Riz rouge (+4,00 €) » */
export function describePick(
  dishName: string,
  opts: Record<string, string>,
  supplementCents: number,
): string {
  const details = Object.values(opts).filter(Boolean);
  const base = [dishName, ...details].join(" · ");
  return supplementCents > 0 ? `${base} (+${fmtCents(supplementCents)})` : base;
}

/**
 * Une formule est commandable si chacun de ses créneaux obligatoires garde au
 * moins un plat réellement commandable. Sans ce garde-fou, la carte proposerait
 * une formule dont le seul dessert est épuisé — et le client ne s'en rendrait
 * compte qu'au moment de payer.
 */
export function isFormulaOrderable(formula: Formula): boolean {
  if (!formula.active) return false;
  return formula.slots.every((slot) => {
    if (!slot.required) return true;
    return slot.choices.some((c) => c.dish && isOrderable(c.dish));
  });
}

/**
 * Prix affiché « à partir de » : le prix de la formule, les suppléments étant
 * facultatifs. Existe pour que la carte n'annonce jamais un prix inatteignable.
 */
export const formulaFromPriceCents = (f: Formula): number => f.priceCents;

/** Suppléments distincts d'une formule, pour la mention « Suppléments : … ». */
export function formulaSupplements(f: Formula): { name: string; cents: number }[] {
  const seen = new Map<string, number>();
  for (const slot of f.slots) {
    for (const choice of slot.choices) {
      if (choice.supplementCents <= 0 || !choice.dish) continue;
      seen.set(choice.dish.name, choice.supplementCents);
    }
  }
  return [...seen.entries()]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => a.cents - b.cents);
}
