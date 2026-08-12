/* Formules — lecture publique et création (admin).
 *
 * La lecture publique sert l'assistant de composition : elle renvoie chaque
 * créneau avec les plats autorisés **et le plat lui-même**, pour que le client
 * voie photo, description et disponibilité sans second aller-retour.
 *
 * Aucun prix n'est accepté du navigateur ici : la formule est facturée par
 * `lib/formulas.ts` au moment de la commande.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, badRequest, serverError, requireAdmin } from "@/lib/guard";
import { collect, str, int, bool } from "@/lib/validate";
import { rowToFormula } from "@/lib/formulas";

export const dynamic = "force-dynamic";

/** Inclusion complète : créneaux ordonnés, choix ordonnés, plat rattaché. */
const FULL = {
  slots: {
    orderBy: { position: "asc" },
    include: {
      choices: {
        orderBy: { position: "asc" },
        include: { dish: true },
      },
    },
  },
} as const;

/**
 * GET /api/formules — formules de la carte.
 * `?all=1` (ADMIN) inclut les formules désactivées.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantsAll = url.searchParams.get("all") === "1";

  if (wantsAll) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  try {
    const rows = await prisma.formula.findMany({
      where: wantsAll ? {} : { active: true },
      orderBy: { position: "asc" },
      include: FULL,
    });
    return NextResponse.json({ formulas: rows.map(rowToFormula) });
  } catch (error) {
    console.error("[formules] lecture échouée:", error);
    return serverError("Les formules n'ont pas pu être chargées.");
  }
}

interface Body {
  code?: unknown;
  name?: unknown;
  desc?: unknown;
  extra?: unknown;
  priceCents?: unknown;
  active?: unknown;
}

/** POST /api/formules — crée une formule vide (ADMIN). */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    code: str(body.code, "Le code", { min: 1, max: 8 }),
    name: str(body.name, "Le nom", { min: 2, max: 60 }),
    desc: str(body.desc, "La description", { max: 200, required: false }),
    extra: str(body.extra, "L'argument", { max: 80, required: false }),
    priceCents: int(body.priceCents, "Le prix", { min: 0, max: 100_000 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const code = fields.value.code.toUpperCase();

  try {
    const last = await prisma.formula.findFirst({ orderBy: { position: "desc" } });
    const created = await prisma.formula.create({
      data: {
        code,
        name: fields.value.name,
        desc: fields.value.desc,
        extra: fields.value.extra,
        priceCents: fields.value.priceCents,
        active: bool(body.active, true),
        position: (last?.position ?? -1) + 1,
      },
      include: FULL,
    });
    return NextResponse.json({ formula: rowToFormula(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return badRequest(`Le code « ${code} » est déjà utilisé par une autre formule.`);
    }
    console.error("[formules] création échouée:", error);
    return serverError("La formule n'a pas pu être créée.");
  }
}
