import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import {
  BANNER_PLACEMENTS,
  rowToBanner,
  validateBannerInput,
  type BannerPlacement,
} from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/**
 * GET /api/banners?placement=accueil|carte|panier — **publique**.
 *
 * Encarts actifs et dans leur fenêtre de diffusion, pour un emplacement donné,
 * triés par `position`. Sans `placement`, tous les emplacements actifs sont
 * renvoyés.
 *
 * `?all=true` renvoie toutes les bannières avec leur compteur de clics
 * (administration uniquement).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("all") === "true") {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const rows = await prisma.banner.findMany({
      orderBy: [{ placement: "asc" }, { position: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(rows.map(rowToBanner));
  }

  const asked = url.searchParams.get("placement");
  let placement: BannerPlacement | undefined;
  if (asked) {
    if (!(BANNER_PLACEMENTS as readonly string[]).includes(asked)) {
      return badRequest(`L'emplacement doit être : ${BANNER_PLACEMENTS.join(", ")}`);
    }
    placement = asked as BannerPlacement;
  }

  const now = new Date();
  const rows = await prisma.banner.findMany({
    where: {
      active: true,
      ...(placement ? { placement } : {}),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(rows.map(rowToBanner));
}

/** POST /api/banners — création, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const input = validateBannerInput(body);
  if (!input.ok) return badRequest(input.error);

  const row = await prisma.banner.create({ data: input.value });
  return NextResponse.json(rowToBanner(row), { status: 201 });
}
