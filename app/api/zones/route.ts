import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToZone } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { collect, int, stringArray, bool } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/zones — zones de livraison publiques.
 *
 * Route désormais réellement consommée par le tunnel de commande : celui-ci
 * lisait un tableau codé en dur dans `lib/menu.ts`, si bien que modifier les
 * frais dans l'écran d'administration ne changeait rien pour le client.
 */
export async function GET() {
  const rows = await prisma.zone.findMany({
    where: { active: true },
    orderBy: { idx: "asc" },
  });
  return NextResponse.json(rows.map(rowToZone));
}

interface PutBody {
  idx: number;
  feeCents?: number;
  minimumCents?: number;
  villes?: string[];
  zips?: string[];
  active?: boolean;
}

/**
 * PUT /api/zones — **administration uniquement**.
 * Cette route était ouverte et sans bornes : un appel anonyme passait les frais
 * de livraison et les minimums de commande à zéro, voire à des valeurs
 * négatives, et un `idx` inexistant produisait une 500 opaque.
 */
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<PutBody>(req);
  if (!body) return badRequest("Requête invalide");

  const base = collect({ idx: int(body.idx, "L'index de zone", { min: 0, max: 50 }) });
  if (!base.ok) return badRequest(base.error);

  const data: Record<string, unknown> = {};

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

  if (body.villes !== undefined) {
    const v = stringArray(body.villes, "Les communes", { maxItems: 60, maxLen: 60 });
    if (!v.ok) return badRequest(v.error);
    data.cities = JSON.stringify(v.value.filter(Boolean));
  }

  if (body.zips !== undefined) {
    const v = stringArray(body.zips, "Les codes postaux", { maxItems: 60, maxLen: 5 });
    if (!v.ok) return badRequest(v.error);
    const invalid = v.value.find((z) => z && !/^\d{5}$/.test(z));
    if (invalid) return badRequest(`Code postal invalide : ${invalid}`);
    data.zips = JSON.stringify(v.value.filter(Boolean));
  }

  if (body.active !== undefined) data.active = bool(body.active);

  if (Object.keys(data).length === 0) return badRequest("Aucune modification fournie");

  try {
    const row = await prisma.zone.update({ where: { idx: base.value.idx }, data });
    return NextResponse.json(rowToZone(row));
  } catch {
    return notFound("Zone introuvable");
  }
}

/** POST /api/zones — ajout d'une zone, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Omit<PutBody, "idx">>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    feeCents: int(body.feeCents, "Les frais de livraison", { min: 0, max: 50_00 }),
    minimumCents: int(body.minimumCents, "Le minimum de commande", { min: 0, max: 500_00 }),
    villes: stringArray(body.villes, "Les communes", { maxItems: 60, maxLen: 60 }),
    zips: stringArray(body.zips, "Les codes postaux", { maxItems: 60, maxLen: 5 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const last = await prisma.zone.findFirst({ orderBy: { idx: "desc" }, select: { idx: true } });

  const row = await prisma.zone.create({
    data: {
      idx: (last?.idx ?? -1) + 1,
      feeCents: fields.value.feeCents,
      minimumCents: fields.value.minimumCents,
      cities: JSON.stringify(fields.value.villes.filter(Boolean)),
      zips: JSON.stringify(fields.value.zips.filter(Boolean)),
    },
  });

  return NextResponse.json(rowToZone(row), { status: 201 });
}
