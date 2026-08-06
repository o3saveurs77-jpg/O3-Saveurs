import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound } from "@/lib/guard";
import { refreshPage } from "@/lib/pageContent";
import { isPageSlug, normalizeContent, type PageSlug } from "@/lib/pageSections";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/page-sections/[id] — **administration uniquement**.
 *
 * Accepte `label`, `visible` et `content`. Ni `page` ni `kind` : déplacer une
 * section d'une page à l'autre ou changer son type reviendrait à garder un
 * contenu conçu pour une autre mise en page — mieux vaut supprimer et
 * réajouter, ce que l'écran d'édition propose en deux clics.
 *
 * Le contenu reçu repasse toujours par `normalizeContent` : c'est là que les
 * liens `javascript:` et les images d'un domaine non autorisé sont écartés,
 * quel que soit l'expéditeur de la requête.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<{ label?: unknown; visible?: unknown; content?: unknown }>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.pageSection.findUnique({ where: { id } });
  if (!current) return notFound("Section introuvable");

  const data: { label?: string; visible?: boolean; contentJson?: string } = {};
  if (typeof body.label === "string") data.label = body.label.slice(0, 120).trim();
  if (typeof body.visible === "boolean") data.visible = body.visible;
  if (body.content !== undefined) {
    data.contentJson = JSON.stringify(normalizeContent(body.content));
  }
  if (!Object.keys(data).length) return badRequest("Rien à enregistrer");

  const row = await prisma.pageSection.update({ where: { id }, data });

  if (isPageSlug(row.page)) refreshPage(row.page);

  return NextResponse.json({
    id: row.id,
    page: row.page as PageSlug,
    kind: row.kind,
    label: row.label,
    position: row.position,
    visible: row.visible,
    content: normalizeContent(JSON.parse(row.contentJson)),
  });
}

/** DELETE /api/page-sections/[id] — **administration uniquement**. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const row = await prisma.pageSection.delete({ where: { id } });
    if (isPageSlug(row.page)) refreshPage(row.page);
    return NextResponse.json({ ok: true });
  } catch {
    return notFound("Section introuvable");
  }
}
