import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { promotionEligible } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery-info — public.
 *
 * Seuil de livraison offerte, pour l'affichage côté client (tunnel de
 * commande, encart « on vous livre ? »). La valeur vit dans la promotion
 * automatique de type `free_delivery` (gérée depuis /admin/promotions) :
 * ce n'est pas une constante figée dans le code, pour que la cliente puisse
 * l'ajuster elle-même sans redéploiement.
 *
 * Même chose pour la remise à emporter (« −10 % sur toute la carte à
 * emporter » du dépliant) : sans cet aperçu, le récapitulatif affichait le
 * plein tarif et la remise n'apparaissait qu'à la page de paiement. Ce n'est
 * qu'un aperçu — `computeOrder()` recalcule la remise au paiement.
 */
export async function GET() {
  const [free, pickups] = await Promise.all([
    prisma.promotion.findFirst({
      where: { kind: "free_delivery", active: true, auto: true },
      orderBy: { minSubtotalCents: "asc" },
      select: { minSubtotalCents: true },
    }),
    prisma.promotion.findMany({
      where: { kind: "percent", active: true, auto: true, mode: "emporter" },
      orderBy: { value: "desc" },
    }),
  ]);

  // Dates et jour de la semaine vérifiés ici ; le minimum, côté tunnel.
  const now = new Date();
  const pickup = pickups.find((p) => promotionEligible(p, Number.MAX_SAFE_INTEGER, now, "emporter").ok);

  return NextResponse.json({
    freeDeliveryThresholdCents: free?.minSubtotalCents ?? null,
    pickupDiscount: pickup
      ? { label: pickup.label, percent: pickup.value, minSubtotalCents: pickup.minSubtotalCents }
      : null,
  });
}
