import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToZone } from "@/lib/serialize";
import { resolveZone } from "@/lib/zones";
import { formatKm, maxDeliveryKm, tierForDistance } from "@/lib/delivery";
import { isGeoConfigured, roadDistanceKm } from "@/lib/geo";
import { deliveryOrigin, getDeliveryTiers, getSetting } from "@/lib/settings";
import { readJson, badRequest } from "@/lib/guard";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

interface Body {
  address?: string | null;
  zip?: string | null;
  city?: string | null;
  placeId?: string | null;
}

export interface DeliveryQuote {
  /** comment le tarif a été obtenu — sert à l'affichage, pas à la facturation */
  via: "distance" | "zones";
  deliverable: boolean;
  distanceKm: number | null;
  feeCents: number | null;
  minimumCents: number | null;
  /** rayon maximal livré, quand le barème à la distance est actif */
  maxKm: number | null;
  message: string | null;
}

/**
 * POST /api/delivery-quote — frais de livraison pour une adresse, **estimation**.
 *
 * Le tarif définitif reste celui que `computeOrder()` recalcule à la commande :
 * cette route ne fait que montrer au client ce qu'il paiera, avant qu'il ne
 * remplisse tout le formulaire. Elle applique exactement la même logique et les
 * mêmes données, donc les deux ne peuvent pas diverger.
 *
 * Elle ne crée rien et ne prend aucun montant en entrée.
 */
export async function POST(req: Request) {
  const limit = hit(
    clientKey(req, "quote"),
    LIMITS.deliveryQuote.limit,
    LIMITS.deliveryQuote.windowMs,
  );
  if (!limit.ok) return tooManyRequests(limit, "Trop de vérifications. Patientez un instant.");

  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const mode = await getSetting("delivery.mode");

  if (mode === "distance" && isGeoConfigured()) {
    const tiers = await getDeliveryTiers();
    const origin = tiers.length > 0 ? await deliveryOrigin() : null;

    if (origin) {
      const address = [body.address, body.zip, body.city]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(", ");

      const km = await roadDistanceKm(origin, {
        placeId: body.placeId ?? null,
        address: address || null,
      });

      if (km !== null) {
        const tier = tierForDistance(tiers, km);
        const maxKm = maxDeliveryKm(tiers);

        return NextResponse.json<DeliveryQuote>({
          via: "distance",
          deliverable: !!tier,
          distanceKm: km,
          feeCents: tier?.feeCents ?? null,
          minimumCents: tier?.minimumCents ?? null,
          maxKm,
          message: tier
            ? null
            : `Adresse à ${formatKm(km)} km — au-delà de notre rayon de livraison${
                maxKm !== null ? ` de ${formatKm(maxKm)} km` : ""
              }.`,
        });
      }
    }
  }

  // ── Repli : zones par code postal, comme à la facturation ──
  const zoneRows = await prisma.zone.findMany({
    where: { active: true },
    orderBy: { idx: "asc" },
  });
  const match = resolveZone(zoneRows.map(rowToZone), { zip: body.zip, city: body.city });
  const found = match ? zoneRows.find((z) => z.idx === match.zoneIdx) : null;

  return NextResponse.json<DeliveryQuote>({
    via: "zones",
    deliverable: !!found,
    distanceKm: null,
    feeCents: found?.feeCents ?? null,
    minimumCents: found?.minimumCents ?? null,
    maxKm: null,
    message: found ? null : "Nous ne livrons pas encore à cette adresse.",
  });
}
