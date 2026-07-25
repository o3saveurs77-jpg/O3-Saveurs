import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToUser } from "@/lib/serialize";
import { requireUser, readJson, badRequest } from "@/lib/guard";
import { collect, str, phone as vPhone, stringArray, zip as vZip } from "@/lib/validate";
import type { SavedAddress } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Bornes de taille : sans elles, un client pouvait écrire plusieurs Mo dans sa ligne. */
const MAX_ADDRESSES = 10;
const MAX_FAVORITES = 200;

/** GET /api/auth/me — profil de l'utilisateur courant, ou `null`. */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return NextResponse.json(null);

  const row = await prisma.user.findUnique({ where: { email: guard.user.email } });
  return NextResponse.json(row ? { ...rowToUser(row), role: row.role } : null);
}

interface PatchBody {
  name?: string;
  phone?: string;
  favorites?: string[];
  addresses?: SavedAddress[];
}

/**
 * PATCH /api/auth/me — profil, favoris, adresses enregistrées.
 *
 * `email`, `role` et `password` sont volontairement absents de la liste blanche :
 * l'email est l'identifiant de connexion, et le rôle ne se modifie pas depuis le
 * client. Les tableaux étaient auparavant sérialisés sans aucune limite de taille
 * ni de structure.
 */
export async function PATCH(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const body = await readJson<PatchBody>(req);
  if (!body) return badRequest("Requête invalide");

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const v = str(body.name, "Le nom", { min: 2, max: 80 });
    if (!v.ok) return badRequest(v.error);
    data.name = v.value;
  }

  if (body.phone !== undefined) {
    const v = vPhone(body.phone, { required: false });
    if (!v.ok) return badRequest(v.error);
    data.phone = v.value;
  }

  if (body.favorites !== undefined) {
    const v = stringArray(body.favorites, "Les favoris", { maxItems: MAX_FAVORITES, maxLen: 40 });
    if (!v.ok) return badRequest(v.error);
    data.favorites = JSON.stringify(v.value);
  }

  if (body.addresses !== undefined) {
    const parsed = validateAddresses(body.addresses);
    if (!parsed.ok) return badRequest(parsed.error);
    data.addresses = JSON.stringify(parsed.value);
  }

  if (Object.keys(data).length === 0) return badRequest("Aucune modification fournie");

  const row = await prisma.user.update({ where: { email: guard.user.email }, data });
  return NextResponse.json(rowToUser(row));
}

function validateAddresses(
  input: unknown,
): { ok: true; value: SavedAddress[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Les adresses doivent être une liste" };
  if (input.length > MAX_ADDRESSES) {
    return { ok: false, error: `Vous ne pouvez pas enregistrer plus de ${MAX_ADDRESSES} adresses` };
  }

  const out: SavedAddress[] = [];
  for (const [i, raw] of input.entries()) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: `Adresse ${i + 1} invalide` };
    }
    const a = raw as Record<string, unknown>;

    const fields = collect({
      label: str(a.label, "Le libellé", { max: 40 }),
      address: str(a.address, "L'adresse", { min: 5, max: 200 }),
      city: str(a.city, "La ville", { min: 2, max: 80 }),
      zip: vZip(a.zip),
    });
    if (!fields.ok) return { ok: false, error: fields.error };

    out.push({
      id: typeof a.id === "string" && a.id.length <= 40 ? a.id : `a${i + 1}`,
      ...fields.value,
    });
  }
  return { ok: true, value: out };
}
