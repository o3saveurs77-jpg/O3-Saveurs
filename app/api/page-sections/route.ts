import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { loadAllSections, refreshPage } from "@/lib/pageContent";
import {
  DEFAULT_SECTIONS,
  KIND_META,
  isPageSlug,
  isSectionKind,
  normalizeContent,
  starterContent,
} from "@/lib/pageSections";

/**
 * Contenu éditorial des pages vitrine — **administration uniquement**.
 *
 * Le site public ne passe pas par ici : il lit la base directement côté
 * serveur (`lib/pageContent.ts`). Cette route ne sert que l'écran d'édition.
 */
export const dynamic = "force-dynamic";

/** GET /api/page-sections?page=accueil — sections de la page, masquées comprises. */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const page = new URL(req.url).searchParams.get("page");
  if (!isPageSlug(page)) return badRequest("Page inconnue");

  return NextResponse.json(await loadAllSections(page));
}

/**
 * POST /api/page-sections — ajoute une section en bas de page.
 *
 * `{ page, kind }` suffit : le contenu de départ vient du catalogue, pour que
 * la cliente voie immédiatement un bloc rempli à retoucher plutôt qu'un cadre
 * vide sans indice de ce qu'il attend.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<{ page?: unknown; kind?: unknown }>(req);
  if (!body) return badRequest("Requête invalide");
  if (!isPageSlug(body.page)) return badRequest("Page inconnue");
  if (!isSectionKind(body.kind)) return badRequest("Type de section inconnu");

  const meta = KIND_META[body.kind];

  // Un second bandeau d'ouverture ou un second bloc « plat du jour » n'aurait
  // aucun sens : la page afficherait deux fois la même chose.
  if (meta.once) {
    const existing = await prisma.pageSection.count({
      where: { page: body.page, kind: body.kind },
    });
    if (existing > 0) {
      return badRequest(`« ${meta.label} » ne peut figurer qu'une fois sur cette page.`);
    }
  }

  const last = await prisma.pageSection.findFirst({
    where: { page: body.page },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const row = await prisma.pageSection.create({
    data: {
      page: body.page,
      kind: body.kind,
      label: meta.label,
      position: (last?.position ?? -1) + 1,
      visible: true,
      contentJson: JSON.stringify(starterContent(body.kind)),
    },
  });

  refreshPage(body.page);
  return NextResponse.json(
    {
      id: row.id,
      page: body.page,
      kind: body.kind,
      label: row.label,
      position: row.position,
      visible: row.visible,
      content: normalizeContent(JSON.parse(row.contentJson)),
    },
    { status: 201 },
  );
}

/**
 * PUT /api/page-sections — réordonne une page, ou la réinitialise.
 *
 * `{ page, order: [id, …] }` fixe l'ordre d'affichage.
 * `{ page, reset: true }` efface tout et réécrit le contenu d'origine : le
 * filet de sécurité après une manipulation malheureuse.
 */
export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<{ page?: unknown; order?: unknown; reset?: unknown }>(req);
  if (!body) return badRequest("Requête invalide");
  if (!isPageSlug(body.page)) return badRequest("Page inconnue");
  const page = body.page;

  if (body.reset === true) {
    await prisma.$transaction([
      prisma.pageSection.deleteMany({ where: { page } }),
      prisma.pageSection.createMany({
        data: DEFAULT_SECTIONS[page].map((s, i) => ({
          page,
          kind: s.kind,
          label: s.label,
          position: i,
          visible: true,
          contentJson: JSON.stringify(s.content),
        })),
      }),
    ]);
    refreshPage(page);
    return NextResponse.json(await loadAllSections(page));
  }

  const order = Array.isArray(body.order) ? body.order.filter((v) => typeof v === "string") : null;
  if (!order?.length) return badRequest("Ordre manquant");

  /* Les positions sont réécrites de 0 à n plutôt que permutées deux à deux :
   * une liste réordonnée plusieurs fois finissait sinon avec des doublons de
   * position, et l'ordre affiché dépendait de la date de création. */
  const rows = await prisma.pageSection.findMany({ where: { page }, select: { id: true } });
  const known = new Set(rows.map((r) => r.id));
  const clean = order.filter((id) => known.has(id));
  if (clean.length !== rows.length) return badRequest("Ordre incomplet");

  await prisma.$transaction(
    clean.map((id, position) => prisma.pageSection.update({ where: { id }, data: { position } })),
  );

  refreshPage(page);
  return NextResponse.json(await loadAllSections(page));
}
