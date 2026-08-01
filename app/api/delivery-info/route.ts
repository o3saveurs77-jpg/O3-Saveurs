import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery-info — public.
 *
 * Seuil de livraison offerte, pour l'affichage côté client (tunnel de
 * commande, encart « on vous livre ? »). La valeur vit dans la promotion
 * automatique de type `free_delivery` (gérée depuis /admin/promotions) :
 * ce n'est pas une constante figée dans le code, pour que la cliente puisse
 * l'ajuster elle-même sans redéploiement.
 */
export async function GET() {
  const promo = await prisma.promotion.findFirst({
    where: { kind: "free_delivery", active: true, auto: true },
    orderBy: { minSubtotalCents: "asc" },
    select: { minSubtotalCents: true },
  });

  return NextResponse.json({ freeDeliveryThresholdCents: promo?.minSubtotalCents ?? null });
}
