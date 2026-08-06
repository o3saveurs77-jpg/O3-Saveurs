import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDish, rowToZone } from "@/lib/serialize";
import { optionalUser, readJson, badRequest } from "@/lib/guard";
import { priceLines, promotionDiscount, promotionEligible, subtotalOf } from "@/lib/pricing";
import type { RawLine } from "@/lib/pricing";
import { rowToFormula } from "@/lib/formulas";
import { resolveZone } from "@/lib/zones";
import { normalizePromoCode, validatePromoCode } from "@/lib/promotionValidation";
import type { Zone } from "@/lib/menu";
import type { OrderMode, PromotionKind } from "@/lib/types";

export const dynamic = "force-dynamic";

interface VerifyBody {
  code?: unknown;
  lines?: unknown;
  mode?: unknown;
  zip?: unknown;
  city?: unknown;
}

/**
 * POST /api/promotions/verify — **publique**, prévisualisation d'un code promo
 * dans le tunnel de commande.
 *
 * Deux garde-fous de conception :
 *
 *  1. **Aucun montant n'est accepté du navigateur** (CONTRIBUTING §2). Le corps
 *     ne contient que *ce qui est commandé* (`dishId`, `qty`, `opts`, `formule`)
 *     et *où* (`zip`, `city`) ; le sous-total et les frais de livraison sont
 *     relus en base par `priceLines()` et `resolveZone()`, exactement comme
 *     `computeOrder()`.
 *
 *  2. **Cette route ne décide rien.** Elle affiche. La remise réellement
 *     facturée est recalculée par `computeOrder()` au moment du paiement, à
 *     partir du seul `promoCode`. Rien de ce qu'elle renvoie n'est renvoyé au
 *     serveur pour être appliqué : il n'existe donc aucun chemin par lequel le
 *     navigateur imposerait un montant de remise.
 *
 * Un refus métier (code inconnu, expiré, minimum non atteint) répond 200 avec
 * `{ ok: false, error }` : c'est une issue normale de la vérification, que le
 * tunnel affiche telle quelle. Le 400 est réservé à une requête malformée.
 *
 * À faire au lot 9 : limitation de débit par IP. La route permet en l'état
 * d'énumérer les codes existants ; l'impact reste borné (un code valide donne
 * la remise prévue, rien de plus), mais la limitation reste souhaitable.
 */
export async function POST(req: Request) {
  const body = await readJson<VerifyBody>(req);
  if (!body) return badRequest("Requête invalide");

  // ── Code ──
  const checked = validatePromoCode(body.code);
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error });
  const code = normalizePromoCode(body.code);
  if (!code) return badRequest("Aucun code à vérifier");

  // ── Panier : uniquement quoi et combien, jamais un prix ──
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return badRequest("Votre panier est vide");
  }
  if (body.lines.length > 60) return badRequest("Trop d'articles dans le panier");

  const raw: RawLine[] = [];
  for (const item of body.lines as unknown[]) {
    if (!item || typeof item !== "object") return badRequest("Ligne de panier invalide");
    const line = item as Record<string, unknown>;
    const qty = typeof line.qty === "number" ? line.qty : Number(line.qty);

    // ── Ligne formule : la formule et un plat par créneau, aucun montant ──
    if (typeof line.formulaId === "string" && line.formulaId) {
      const picks = Array.isArray(line.picks) ? (line.picks as Record<string, unknown>[]) : [];
      raw.push({
        formulaId: line.formulaId,
        qty,
        picks: picks
          .filter((p) => typeof p?.slotId === "string" && typeof p?.dishId === "string")
          .map((p) => ({
            slotId: p.slotId as string,
            dishId: p.dishId as string,
            opts:
              p.opts && typeof p.opts === "object"
                ? (p.opts as Record<string, string>)
                : undefined,
          })),
      });
      continue;
    }

    if (typeof line.dishId !== "string" || !line.dishId) return badRequest("Plat inconnu");
    raw.push({
      dishId: line.dishId,
      qty,
      opts:
        line.opts && typeof line.opts === "object"
          ? (line.opts as Record<string, string>)
          : undefined,
      formule: typeof line.formule === "string" ? line.formule : null,
    });
  }

  const mode: OrderMode = body.mode === "livraison" ? "livraison" : "emporter";

  /* Les plats à relire couvrent les deux formes de ligne : commandés à la
   * carte, ou retenus dans un créneau de formule. */
  const dishIds = [
    ...new Set([
      ...raw.map((l) => l.dishId).filter((id): id is string => Boolean(id)),
      ...raw.flatMap((l) => (l.picks ?? []).map((p) => p.dishId)),
    ]),
  ];
  const formulaIds = [
    ...new Set(raw.map((l) => l.formulaId).filter((id): id is string => Boolean(id))),
  ];

  const [dishRows, formulaRows] = await Promise.all([
    prisma.dish.findMany({ where: { id: { in: dishIds } } }),
    formulaIds.length
      ? prisma.formula.findMany({
          where: { id: { in: formulaIds } },
          include: { slots: { include: { choices: true } } },
        })
      : Promise.resolve([]),
  ]);

  const priced = priceLines(dishRows.map(rowToDish), raw, formulaRows.map(rowToFormula));
  if (!priced.ok) return NextResponse.json({ ok: false, error: priced.error });
  const subtotalCents = subtotalOf(priced.value);

  // ── Frais de livraison, déduits de l'adresse côté serveur ──
  let feeCents = 0;
  if (mode === "livraison") {
    const zoneRows = await prisma.zone.findMany({
      where: { active: true },
      orderBy: { idx: "asc" },
    });
    const zones: Zone[] = zoneRows.map(rowToZone);
    const match = resolveZone(zones, {
      zip: typeof body.zip === "string" ? body.zip : null,
      city: typeof body.city === "string" ? body.city : null,
    });
    const zone = match ? zoneRows.find((z) => z.idx === match.zoneIdx) : undefined;
    feeCents = zone?.feeCents ?? 0;
  }

  // ── Éligibilité : même fonction que `computeOrder()` ──
  const promo = await prisma.promotion.findUnique({ where: { code } });
  if (!promo) return NextResponse.json({ ok: false, error: "Code promotionnel inconnu" });

  const eligible = promotionEligible(promo, subtotalCents, new Date());
  if (!eligible.ok) return NextResponse.json({ ok: false, error: eligible.error });

  if (promo.oncePerCustomer) {
    const session = await optionalUser();
    if (session) {
      const already = await prisma.order.count({
        where: {
          promotionId: promo.id,
          customerEmail: session.email.toLowerCase(),
          status: { not: "annulee" },
        },
      });
      if (already > 0) {
        return NextResponse.json({ ok: false, error: "Vous avez déjà utilisé ce code" });
      }
    }
  }

  const { discountCents, freeDelivery } = promotionDiscount(promo, subtotalCents, feeCents);
  const effectiveFee = freeDelivery ? 0 : feeCents;

  return NextResponse.json({
    ok: true,
    code: promo.code,
    label: promo.label,
    kind: promo.kind as PromotionKind,
    // Aperçu — recalculé par computeOrder() au paiement.
    subtotalCents,
    discountCents,
    feeCents: effectiveFee,
    totalCents: Math.max(0, subtotalCents - discountCents + effectiveFee),
    freeDelivery,
  });
}
