/* Calcul d'une commande — **côté serveur uniquement**.
 *
 * C'est le module qui ferme la faille principale de l'audit : les prix, les
 * frais de livraison et les totaux étaient repris du corps de la requête, si
 * bien qu'un panier de 80 € pouvait être encaissé à 1 centime par Stripe.
 *
 * Règle absolue : **rien de ce que le navigateur envoie sur l'argent n'est
 * utilisé**. Le client transmet seulement *quoi* il commande (dishId, quantité,
 * options, formule) et *où* il veut être livré. Tout le reste est relu en base.
 *
 * Le module est pur vis-à-vis des montants : `computeOrder` lit la base pour
 * charger plats, zones et promotions, puis `priceLines` / `applyPromotion`
 * font le calcul sans effet de bord, ce qui les rend testables directement.
 */

import { prisma } from "@/lib/prisma";
import { rowToDish, rowToZone } from "@/lib/serialize";
import { applyPercent, VAT_RATE_BP } from "@/lib/money";
import { resolveZone } from "@/lib/zones";
import { formatKm, maxDeliveryKm, tierForDistance } from "@/lib/delivery";
import { isGeoConfigured, roadDistanceKm } from "@/lib/geo";
import { deliveryOrigin, getDeliveryTiers, getSetting } from "@/lib/settings";
import { priceFormula, rowToFormula, type RawPick } from "@/lib/formulas";
import { cartLeadTimeHours } from "@/lib/preorder";
import type { Dish, Formula, Zone } from "@/lib/menu";
import type { OrderLine, OrderMode, PromotionKind } from "@/lib/types";
import { err, ok, type Result } from "@/lib/validate";

/**
 * Ce que le client est autorisé à choisir. Aucun montant.
 *
 * Deux formes de ligne : un plat à la carte (`dishId`), ou une formule garnie
 * (`formulaId` + un plat par créneau). Les deux sont valorisées ici, jamais par
 * le navigateur.
 */
export interface RawLine {
  dishId?: string;
  qty: number;
  opts?: Record<string, string>;
  formule?: string | null;
  note?: string;
  /** formule composée — exclusif de `dishId` */
  formulaId?: string;
  /** plat retenu par créneau */
  picks?: RawPick[];
}

export interface ComputeInput {
  lines: RawLine[];
  mode: OrderMode;
  /** adresse de livraison — sert à déduire la zone côté serveur */
  zip?: string | null;
  city?: string | null;
  /** rue saisie — complète l'adresse mesurée en tarification à la distance */
  address?: string | null;
  /**
   * Identifiant Google de l'adresse choisie dans l'autocomplétion. C'est un
   * **indice de mesure**, pas un tarif : le serveur s'en sert pour interroger
   * Google lui-même. Un client qui le falsifie ne peut que désigner une autre
   * adresse, jamais imposer un prix.
   */
  placeId?: string | null;
  promoCode?: string | null;
  /** pour la règle « une seule fois par client » */
  customerEmail?: string | null;
}

export interface AppliedPromotion {
  id: string;
  code: string | null;
  label: string;
  kind: PromotionKind;
  discountCents: number;
  /** true si la promotion offre les frais de livraison */
  freeDelivery: boolean;
}

export interface PricedOrder {
  lines: OrderLine[];
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
  vatRateBp: number;
  zone: { idx: number; feeCents: number; minimumCents: number } | null;
  /** Distance routière retenue, quand la tarification s'est faite à la distance. */
  distanceKm: number | null;
  promotion: AppliedPromotion | null;
  /**
   * Délai de préparation du panier, en heures : le plus long de ses plats.
   *
   * Zéro pour une commande du jour. Au-delà, le tunnel exige une date de
   * retrait et la commande passera par l'accord du restaurant — voir
   * `lib/preorder.ts`.
   */
  leadTimeHours: number;
}

const MAX_QTY_PER_LINE = 50;
const MAX_LINES = 60;

// ─── Prix d'une ligne ──────────────────────────────────────────

/**
 * Prix unitaire d'une ligne : prix de base (ou prix de la formule choisie),
 * plus les suppléments des options réellement sélectionnées.
 *
 * Correction au passage : les suppléments d'options étaient affichés « +1,00 € »
 * dans la fiche plat mais n'étaient jamais ajoutés au prix facturé.
 */
export function unitPriceOf(dish: Dish, line: RawLine): Result<number> {
  const formules = dish.formules ?? [];
  let base: number;

  if (formules.length > 0) {
    if (!line.formule) return err(`Choisissez une formule pour « ${dish.name} »`);
    const match = formules.find(([label]) => label === line.formule);
    if (!match) return err(`Formule inconnue pour « ${dish.name} »`);
    base = match[1];
  } else {
    if (dish.priceCents === null) return err(`Le prix de « ${dish.name} » n'est pas encore défini`);
    base = dish.priceCents;
  }

  let extras = 0;
  for (const option of dish.options) {
    const chosen = line.opts?.[option.name];
    if (!chosen) {
      if (option.required) return err(`Choisissez « ${option.name} » pour « ${dish.name} »`);
      continue;
    }
    const choice = option.choices.find((c) => c.l === chosen);
    if (!choice) return err(`Choix « ${chosen} » invalide pour « ${option.name} »`);
    extras += choice.priceCents ?? 0;
  }

  return ok(base + extras);
}

/** Valorise chaque ligne et vérifie disponibilité, prix et stock. */
export function priceLines(
  dishes: Dish[],
  raw: RawLine[],
  formulas: Formula[] = [],
): Result<OrderLine[]> {
  if (!raw.length) return err("Votre panier est vide");
  if (raw.length > MAX_LINES) return err("Trop d'articles dans le panier");

  const byId = new Map(dishes.map((d) => [d.id, d]));
  const formulaById = new Map(formulas.map((f) => [f.id, f]));

  // Le stock se vérifie sur le cumul du panier : deux lignes du même plat
  // (options différentes) puisent dans le même stock. Une formule y puise elle
  // aussi, par chacun des plats qui la composent — sinon deux formules
  // « thiéboudiène » videraient la marmite sans que le stock bouge.
  const wanted = new Map<string, number>();
  for (const line of raw) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY_PER_LINE) {
      return err("Quantité invalide");
    }
    if (line.formulaId) {
      for (const pick of line.picks ?? []) {
        if (typeof pick?.dishId !== "string" || !pick.dishId) continue;
        wanted.set(pick.dishId, (wanted.get(pick.dishId) ?? 0) + line.qty);
      }
    } else if (line.dishId) {
      wanted.set(line.dishId, (wanted.get(line.dishId) ?? 0) + line.qty);
    } else {
      return err("Ligne de panier invalide");
    }
  }

  for (const [dishId, qty] of wanted) {
    const dish = byId.get(dishId);
    if (!dish) return err("Un plat de votre panier n'existe plus");
    if (!dish.available) return err(`« ${dish.name} » n'est plus disponible`);
    if (dish.stock !== null && dish.stock < qty) {
      return err(
        dish.stock <= 0
          ? `« ${dish.name} » est épuisé`
          : `Il ne reste que ${dish.stock} × « ${dish.name} »`,
      );
    }
  }

  const lines: OrderLine[] = [];
  for (const line of raw) {
    const note = String(line.note ?? "").slice(0, 300);

    // ── Ligne formule ──
    if (line.formulaId) {
      const formula = formulaById.get(line.formulaId);
      if (!formula) return err("Cette formule n'est plus proposée");

      const priced = priceFormula(formula, line.picks ?? [], byId);
      if (!priced.ok) return priced;

      // La vignette du panier reprend la photo du premier plat retenu qui en a
      // une : une formule n'a pas d'image propre.
      const photo =
        priced.value.picks.map((p) => byId.get(p.dishId)?.photo).find((p) => p) ?? null;

      lines.push({
        dishId: "",
        formulaId: formula.id,
        picks: priced.value.picks,
        name: `Formule ${formula.name}`,
        photo,
        unitPriceCents: priced.value.unitPriceCents,
        qty: line.qty,
        lineTotalCents: priced.value.unitPriceCents * line.qty,
        opts: priced.value.opts,
        formule: formula.code,
        note,
      });
      continue;
    }

    // ── Ligne à la carte ──
    const dish = byId.get(line.dishId!)!;
    const unit = unitPriceOf(dish, line);
    if (!unit.ok) return unit;

    lines.push({
      dishId: dish.id,
      name: dish.name,
      photo: dish.photo,
      unitPriceCents: unit.value,
      qty: line.qty,
      lineTotalCents: unit.value * line.qty,
      opts: line.opts ?? {},
      formule: line.formule ?? null,
      note,
    });
  }

  return ok(lines);
}


export const subtotalOf = (lines: OrderLine[]): number =>
  lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

// ─── Promotions ────────────────────────────────────────────────

interface PromotionRow {
  id: string;
  code: string | null;
  label: string;
  kind: string;
  value: number;
  minSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  oncePerCustomer: boolean;
  weekday: number | null;
  auto: boolean;
  active: boolean;
}

/** Une promotion est-elle utilisable maintenant, pour ce montant ? */
export function promotionEligible(
  promo: PromotionRow,
  subtotalCents: number,
  at: Date = new Date(),
): Result<true> {
  if (!promo.active) return err("Ce code promotionnel n'est plus actif");
  if (promo.startsAt && at < promo.startsAt) return err("Ce code n'est pas encore valable");
  if (promo.endsAt && at > promo.endsAt) return err("Ce code a expiré");
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return err("Ce code a atteint sa limite d'utilisation");
  }
  if (promo.weekday !== null && at.getDay() !== promo.weekday) {
    return err("Ce code n'est pas valable aujourd'hui");
  }
  if (subtotalCents < promo.minSubtotalCents) {
    return err(`Ce code s'applique à partir de ${(promo.minSubtotalCents / 100).toFixed(2)} €`);
  }
  return ok(true);
}

/** Remise en centimes, bornée au sous-total (jamais de total négatif). */
export function promotionDiscount(
  promo: Pick<PromotionRow, "kind" | "value">,
  subtotalCents: number,
  feeCents: number,
): { discountCents: number; freeDelivery: boolean } {
  switch (promo.kind as PromotionKind) {
    case "percent":
      return {
        discountCents: Math.min(subtotalCents, applyPercent(subtotalCents, promo.value)),
        freeDelivery: false,
      };
    case "amount":
      return { discountCents: Math.min(subtotalCents, promo.value), freeDelivery: false };
    case "free_delivery":
      return { discountCents: 0, freeDelivery: feeCents > 0 };
    default:
      return { discountCents: 0, freeDelivery: false };
  }
}

// ─── Calcul complet ────────────────────────────────────────────

/**
 * Calcule une commande de bout en bout depuis la base.
 * Renvoie une erreur explicite et lisible par le client en cas de refus
 * (hors zone, sous le minimum, plat épuisé, code invalide…).
 */
export async function computeOrder(input: ComputeInput): Promise<Result<PricedOrder>> {
  /* Les plats à relire couvrent les deux formes de ligne : ceux commandés à la
   * carte, et ceux retenus dans les créneaux d'une formule. */
  const dishIds = [
    ...new Set([
      ...input.lines.map((l) => l.dishId).filter((id): id is string => Boolean(id)),
      ...input.lines.flatMap((l) => (l.picks ?? []).map((p) => p.dishId)),
    ]),
  ];
  const formulaIds = [
    ...new Set(input.lines.map((l) => l.formulaId).filter((id): id is string => Boolean(id))),
  ];
  if (!dishIds.length && !formulaIds.length) return err("Votre panier est vide");

  const [dishRows, zoneRows, formulaRows] = await Promise.all([
    prisma.dish.findMany({ where: { id: { in: dishIds } } }),
    prisma.zone.findMany({ where: { active: true }, orderBy: { idx: "asc" } }),
    formulaIds.length
      ? prisma.formula.findMany({
          where: { id: { in: formulaIds } },
          include: { slots: { include: { choices: true } } },
        })
      : Promise.resolve([]),
  ]);

  const dishes = dishRows.map(rowToDish);
  const zones: Zone[] = zoneRows.map(rowToZone);
  const formulas: Formula[] = formulaRows.map(rowToFormula);

  const priced = priceLines(dishes, input.lines, formulas);
  if (!priced.ok) return priced;
  const lines = priced.value;
  const subtotalCents = subtotalOf(lines);

  // ── Frais de livraison, déduits de l'adresse et jamais du client ──
  let zone: PricedOrder["zone"] = null;
  let feeCents = 0;
  let distanceKm: number | null = null;

  if (input.mode === "livraison") {
    const billed = await deliveryCharge(input, zones, zoneRows);
    if (!billed.ok) return billed;

    zone = billed.value.zone;
    feeCents = billed.value.feeCents;
    distanceKm = billed.value.distanceKm;

    if (subtotalCents < billed.value.minimumCents) {
      return err(
        `Le minimum de commande pour cette adresse est de ${(
          billed.value.minimumCents / 100
        ).toFixed(2)} €`,
      );
    }
  }

  // ── Promotion : code saisi, sinon meilleure promotion automatique ──
  let promotion: AppliedPromotion | null = null;
  const now = new Date();

  if (input.promoCode) {
    const code = input.promoCode.trim().toUpperCase();
    const promo = await prisma.promotion.findUnique({ where: { code } });
    if (!promo) return err("Code promotionnel inconnu");

    const eligible = promotionEligible(promo, subtotalCents, now);
    if (!eligible.ok) return eligible;

    if (promo.oncePerCustomer && input.customerEmail) {
      const already = await prisma.order.count({
        where: {
          promotionId: promo.id,
          customerEmail: input.customerEmail.toLowerCase(),
          status: { not: "annulee" },
        },
      });
      if (already > 0) return err("Vous avez déjà utilisé ce code");
    }

    const { discountCents, freeDelivery } = promotionDiscount(promo, subtotalCents, feeCents);
    promotion = {
      id: promo.id,
      code: promo.code,
      label: promo.label,
      kind: promo.kind as PromotionKind,
      discountCents,
      freeDelivery,
    };
  } else {
    const autos = await prisma.promotion.findMany({ where: { active: true, auto: true } });
    let best: AppliedPromotion | null = null;
    for (const promo of autos) {
      if (!promotionEligible(promo, subtotalCents, now).ok) continue;
      const { discountCents, freeDelivery } = promotionDiscount(promo, subtotalCents, feeCents);
      const gain = discountCents + (freeDelivery ? feeCents : 0);
      const bestGain = best ? best.discountCents + (best.freeDelivery ? feeCents : 0) : -1;
      if (gain > bestGain && gain > 0) {
        best = {
          id: promo.id,
          code: promo.code,
          label: promo.label,
          kind: promo.kind as PromotionKind,
          discountCents,
          freeDelivery,
        };
      }
    }
    promotion = best;
  }

  const discountCents = promotion?.discountCents ?? 0;
  const effectiveFee = promotion?.freeDelivery ? 0 : feeCents;
  const totalCents = Math.max(0, subtotalCents - discountCents + effectiveFee);

  return ok({
    lines,
    subtotalCents,
    discountCents,
    feeCents: effectiveFee,
    totalCents,
    vatRateBp: VAT_RATE_BP,
    zone,
    distanceKm,
    promotion,
    /* `dishes` ne contient que les plats réellement au panier — ceux commandés
     * à la carte comme ceux retenus dans les créneaux d'une formule. Le délai
     * du panier est donc bien celui du plat le plus lent qu'il contient. */
    leadTimeHours: cartLeadTimeHours(dishes),
  });
}

/**
 * Frais et minimum de commande pour une adresse de livraison.
 *
 * Deux stratégies, dans cet ordre :
 *
 *  1. **Distance routière** (`delivery.mode = "distance"`), qui facture le
 *     trajet réel — deux adresses d'un même code postal peuvent être à 2 et
 *     9 km, et les traiter au même tarif fait perdre de l'argent sur l'une.
 *  2. **Zones par code postal**, conservées comme filet de sécurité.
 *
 * Le repli est **silencieux et automatique** : clé Google absente, quota
 * dépassé, API muette, adresse introuvable. Une dépendance externe en panne ne
 * doit jamais empêcher une commande — c'est la règle appliquée partout ailleurs
 * dans ce tunnel. Le seul refus possible reste « nous ne livrons pas là », et
 * il vient toujours d'une donnée, jamais d'une panne.
 */
async function deliveryCharge(
  input: ComputeInput,
  zones: Zone[],
  zoneRows: { idx: number; feeCents: number; minimumCents: number }[],
): Promise<
  Result<{
    zone: PricedOrder["zone"];
    feeCents: number;
    minimumCents: number;
    distanceKm: number | null;
  }>
> {
  const mode = await getSetting("delivery.mode");

  if (mode === "distance" && isGeoConfigured()) {
    const tiers = await getDeliveryTiers();
    if (tiers.length > 0) {
      const origin = await deliveryOrigin();
      if (origin) {
        const address = [input.address, input.zip, input.city].filter(Boolean).join(", ");
        const km = await roadDistanceKm(origin, {
          placeId: input.placeId ?? null,
          address: address || null,
        });

        if (km !== null) {
          const tier = tierForDistance(tiers, km);
          if (tier) {
            return ok({
              zone: { idx: tier.idx, feeCents: tier.feeCents, minimumCents: tier.minimumCents },
              feeCents: tier.feeCents,
              minimumCents: tier.minimumCents,
              distanceKm: km,
            });
          }
          /* Distance mesurée de façon fiable, mais au-delà du dernier palier :
           * c'est un vrai refus, pas une panne. Replier sur les zones ici
           * ferait livrer une adresse que la cliente a explicitement exclue. */
          const limite = maxDeliveryKm(tiers);
          return err(
            limite !== null
              ? `Cette adresse est à ${formatKm(km)} km, au-delà de notre rayon de livraison de ${formatKm(limite)} km. Vous pouvez commander à emporter.`
              : "Nous ne livrons pas encore à cette adresse.",
          );
        }
      }
    }
  }

  // ── Repli : zones par code postal ──
  const match = resolveZone(zones, { zip: input.zip, city: input.city });
  if (!match) {
    return err(
      "Nous ne livrons pas encore à cette adresse. Vérifiez le code postal, ou choisissez « à emporter ».",
    );
  }
  const found = zoneRows.find((z) => z.idx === match.zoneIdx);
  if (!found) return err("Zone de livraison introuvable");

  return ok({
    zone: { idx: found.idx, feeCents: found.feeCents, minimumCents: found.minimumCents },
    feeCents: found.feeCents,
    minimumCents: found.minimumCents,
    distanceKm: null,
  });
}

/**
 * Lignes Stripe correspondant **exactement** au calcul serveur.
 * Construites depuis `PricedOrder`, jamais depuis le panier du navigateur.
 * La remise passe par un coupon Stripe géré à part ; ici on envoie les articles
 * au prix réel et les frais de livraison en ligne distincte.
 */
export function stripeLineItems(order: PricedOrder) {
  const items = order.lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency: "eur",
      unit_amount: l.unitPriceCents,
      product_data: {
        name: l.name,
        // Sur une formule, la composition est plus parlante que le code « F3 ».
        description: Object.values(l.opts).join(", ") || l.formule || undefined,
      },
    },
  }));

  if (order.feeCents > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: order.feeCents,
        product_data: { name: "Frais de livraison", description: undefined },
      },
    });
  }

  return items;
}
