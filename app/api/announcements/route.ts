import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { rowToAnnouncement, validateAnnouncementInput } from "@/lib/promotionValidation";

export const dynamic = "force-dynamic";

/**
 * GET /api/announcements — **publique**.
 *
 * Annonces actives et dans leur fenêtre de diffusion, triées par `position`
 * (« Fermé le 15 août », « Nouveau : … »). Les bornes nulles valent
 * « sans limite », le filtrage est fait en base pour ne jamais envoyer au
 * navigateur une annonce qu'il ne doit pas voir.
 *
 * `?all=true` renvoie toutes les annonces (administration uniquement).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("all") === "true") {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const rows = await prisma.announcement.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(rows.map(rowToAnnouncement));
  }

  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(rows.map(rowToAnnouncement));
}

/** POST /api/announcements — création, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Requête invalide");

  const input = validateAnnouncementInput(body);
  if (!input.ok) return badRequest(input.error);

  const row = await prisma.announcement.create({ data: input.value });
  return NextResponse.json(rowToAnnouncement(row), { status: 201 });
}
