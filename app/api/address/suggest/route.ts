import { NextResponse } from "next/server";
import { suggestAddresses, isGeoConfigured } from "@/lib/geo";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/address/suggest?q=…&token=… — autocomplétion d'adresse, publique.
 *
 * Ce mandataire existe pour que `GOOGLE_MAPS_API_KEY` reste côté serveur.
 * L'alternative habituelle — charger le SDK Google dans le navigateur — expose
 * la clé à tout visiteur : elle est alors utilisable par n'importe qui, et
 * facturée à la cliente.
 *
 * Sans clé configurée, renvoie une liste vide plutôt qu'une erreur : le champ
 * d'adresse redevient une simple saisie libre et la commande reste possible.
 */
export async function GET(req: Request) {
  const limit = hit(
    clientKey(req, "address"),
    LIMITS.addressSuggest.limit,
    LIMITS.addressSuggest.windowMs,
  );
  if (!limit.ok) return tooManyRequests(limit, "Trop de recherches. Patientez un instant.");

  if (!isGeoConfigured()) return NextResponse.json({ suggestions: [], configured: false });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const token = url.searchParams.get("token") ?? undefined;

  const suggestions = await suggestAddresses(q, token);
  return NextResponse.json({ suggestions, configured: true });
}
