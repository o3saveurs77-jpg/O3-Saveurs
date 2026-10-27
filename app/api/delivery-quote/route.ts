import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToZone } from "@/lib/serialize";
import { resolveZone } from "@/lib/zones";
import { maxDeliveryKm, outOfRangeMessage, tierForTrip } from "@/lib/delivery";
import { isGeoConfigured, measureDelivery, zipMismatchMessage } from "@/lib/geo";
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
  /** durée du trajet en voiture, quand elle a été mesurée */
  durationMinutes: number | null;
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

      const measure = await measureDelivery(origin, {
        placeId: body.placeId ?? null,
        address: address || null,
        zip: body.zip,
      });

      if (measure.kind === "zip_mismatch") {
        return NextResponse.json<DeliveryQuote>({
          via: "distance",
          deliverable: false,
          distanceKm: null,
          durationMinutes: null,
          feeCents: null,
          minimumCents: null,
          maxKm: maxDeliveryKm(tiers),
          message: zipMismatchMessage(measure),
        });
      }

      if (measure.kind === "ok") {
        const { km, minutes } = measure;
        const found = tierForTrip(tiers, km, minutes);
        const tier = found?.ok ? found.tier : null;

        return NextResponse.json<DeliveryQuote>({
          via: "distance",
          deliverable: !!tier,
          distanceKm: km,
          durationMinutes: minutes,
          feeCents: tier?.feeCents ?? null,
          minimumCents: tier?.minimumCents ?? null,
          maxKm: maxDeliveryKm(tiers),
          message: tier ? null : outOfRangeMessage(tiers, km, minutes, found),
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
    durationMinutes: null,
    feeCents: found?.feeCents ?? null,
    minimumCents: found?.minimumCents ?? null,
    maxKm: null,
    message: found ? null : "Nous ne livrons pas encore à cette adresse.",
  });
}
