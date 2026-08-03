import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { collect, int, num, bool } from "@/lib/validate";
import { isGeoConfigured } from "@/lib/geo";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery-tiers — barème de livraison à la distance.
 *
 * Public, comme `/api/zones` : le tunnel de commande doit pouvoir afficher la
 * grille tarifaire avant que le client ne saisisse son adresse. Ce sont des
 * tarifs affichés en salle, il n'y a rien à cacher — et le montant facturé est
 * de toute façon recalculé côté serveur (`lib/pricing.ts`).
 *
 * `configured` dit à l'interface si la mesure de distance est réellement
 * opérationnelle, pour ne pas promettre une tarification au kilomètre alors que
 * le repli par zones est en vigueur.
 */
export async function GET() {
  const [rows, mode] = await Promise.all([
    prisma.deliveryTier.findMany({ orderBy: { maxKm: "asc" } }),
    getSetting("delivery.mode"),
  ]);

  return NextResponse.json({
    tiers: rows.map((r) => ({
      idx: r.idx,
      maxKm: r.maxKm,
      feeCents: r.feeCents,
      minimumCents: r.minimumCents,
      active: r.active,
    })),
    mode,
    // Un barème actif mais sans clé Google ne facture rien à la distance : le
    // dire évite un écran d'administration qui ment sur ce qui s'applique.
    configured: isGeoConfigured(),
    active: mode === "distance" && isGeoConfigured() && rows.some((r) => r.active),
  });
}

interface PutBody {
  idx: number;
  maxKm?: number;
  feeCents?: number;
  minimumCents?: number;
  active?: boolean;
}

/** PUT /api/delivery-tiers — modification d'un palier, **administration uniquement**. */
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<PutBody>(req);
  if (!body) return badRequest("Requête invalide");

  const base = collect({ idx: int(body.idx, "L'index du palier", { min: 0, max: 50 }) });
  if (!base.ok) return badRequest(base.error);

  const data: Record<string, unknown> = {};

  if (body.maxKm !== undefined) {
    // Borne haute : au-delà de 100 km ce n'est plus de la livraison de repas,
    // et une saisie à 0 rendrait le palier inatteignable.
    const v = num(body.maxKm, "La distance maximale", { min: 0.1, max: 100 });
    if (!v.ok) return badRequest(v.error);
    data.maxKm = v.value;
  }

  if (body.feeCents !== undefined) {
    const v = int(body.feeCents, "Les frais de livraison", { min: 0, max: 50_00 });
    if (!v.ok) return badRequest(v.error);
    data.feeCents = v.value;
  }

  if (body.minimumCents !== undefined) {
    const v = int(body.minimumCents, "Le minimum de commande", { min: 0, max: 500_00 });
    if (!v.ok) return badRequest(v.error);
    data.minimumCents = v.value;
  }

  if (body.active !== undefined) data.active = bool(body.active);

  if (Object.keys(data).length === 0) return badRequest("Aucune modification fournie");

  try {
    const row = await prisma.deliveryTier.update({ where: { idx: base.value.idx }, data });
    return NextResponse.json(row);
  } catch {
    return notFound("Palier introuvable");
  }
}

/** POST /api/delivery-tiers — ajout d'un palier, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Omit<PutBody, "idx">>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    maxKm: num(body.maxKm, "La distance maximale", { min: 0.1, max: 100 }),
    feeCents: int(body.feeCents, "Les frais de livraison", { min: 0, max: 50_00 }),
    minimumCents: int(body.minimumCents, "Le minimum de commande", { min: 0, max: 500_00 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const last = await prisma.deliveryTier.findFirst({
    orderBy: { idx: "desc" },
    select: { idx: true },
  });

  const row = await prisma.deliveryTier.create({
    data: {
      idx: (last?.idx ?? -1) + 1,
      maxKm: fields.value.maxKm,
      feeCents: fields.value.feeCents,
      minimumCents: fields.value.minimumCents,
    },
  });

  return NextResponse.json(row, { status: 201 });
}

/** DELETE /api/delivery-tiers?idx=… — suppression d'un palier. */
export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const idx = Number(new URL(req.url).searchParams.get("idx"));
  if (!Number.isInteger(idx)) return badRequest("Palier invalide");

  try {
    await prisma.deliveryTier.delete({ where: { idx } });
    return NextResponse.json({ ok: true });
  } catch {
    return notFound("Palier introuvable");
  }
}
