import { NextResponse } from "next/server";
import { resolvePlace } from "@/lib/geo";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/address/resolve?placeId=… — code postal et commune d'une suggestion
 * d'adresse choisie, publique.
 *
 * L'autocomplétion de Google ne met pas le code postal dans ses libellés : sans
 * cette route, le client devait le taper, et le taper fait oublier l'adresse
 * choisie (voir `setLocality` dans CheckoutClient). Même limite de débit que
 * l'autocomplétion, dont elle est le prolongement.
 */
export async function GET(req: Request) {
  const limit = hit(
    clientKey(req, "address"),
    LIMITS.addressSuggest.limit,
    LIMITS.addressSuggest.windowMs,
  );
  if (!limit.ok) return tooManyRequests(limit, "Trop de recherches. Patientez un instant.");

  const placeId = new URL(req.url).searchParams.get("placeId") ?? "";
  if (!placeId || placeId.length > 512) return NextResponse.json({ zip: null, city: null });

  const found = await resolvePlace(placeId);
  return NextResponse.json({ zip: found?.zip ?? null, city: found?.city ?? null });
}
