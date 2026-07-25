/* Catégories de la carte.
 *
 * Les catégories étaient une constante (`cats` dans `lib/menu.ts`) : Laila ne
 * pouvait ni en ajouter, ni en masquer, ni changer l'ordre des sections de la
 * carte sans une intervention de développement. Le modèle `Category` les met en
 * base ; `lib/menu.ts` ne sert plus qu'au seed initial (lot 1.7).
 *
 * La clé primaire est le `slug` : c'est lui qui est stocké dans `Dish.cat`, il
 * ne doit donc jamais changer après création — renommer une catégorie se fait
 * par le `label`, pas par le `slug`.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  optionalUser,
  readJson,
  badRequest,
  notFound,
  conflict,
} from "@/lib/guard";
import { collect, str, int, bool } from "@/lib/validate";

export const dynamic = "force-dynamic";

interface CategoryBody {
  slug?: unknown;
  label?: unknown;
  script?: unknown;
  position?: unknown;
  active?: unknown;
}

/** Forme renvoyée par l'API — `slug` est l'identifiant stable. */
function toView(r: {
  slug: string;
  label: string;
  script: string;
  position: number;
  active: boolean;
}) {
  return {
    slug: r.slug,
    label: r.label,
    script: r.script,
    position: r.position,
    active: r.active,
  };
}

/** Un slug doit rester utilisable dans une URL et dans `Dish.cat`. */
function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    // retire les diacritiques (« Entrées » → « entrees »)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * GET /api/categories — **publique** : catégories actives triées par `position`.
 *
 * `?all=true` renvoie aussi les catégories désactivées, mais uniquement à un
 * ADMIN : une section masquée sur la carte ne doit pas être devinable par un
 * visiteur.
 */
export async function GET(req: Request) {
  const wantsAll = new URL(req.url).searchParams.get("all") === "true";
  const user = wantsAll ? await optionalUser() : null;
  const includeInactive = wantsAll && user?.role === "ADMIN";

  const rows = await prisma.category.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });

  return NextResponse.json(rows.map(toView));
}

/** POST /api/categories — création d'une catégorie, **administration uniquement**. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<CategoryBody>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    slug: str(body.slug, "L'identifiant", { min: 2, max: 40 }),
    label: str(body.label, "Le libellé", { min: 2, max: 60 }),
    script: str(body.script, "Le titre décoratif", { max: 60, required: false }),
    position: int(body.position ?? 0, "La position", { min: 0, max: 999 }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const slug = normalizeSlug(fields.value.slug);
  if (!slug) return badRequest("L'identifiant doit contenir des lettres ou des chiffres");

  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return conflict(`La catégorie « ${slug} » existe déjà`);

  const row = await prisma.category.create({
    data: {
      slug,
      label: fields.value.label,
      // Le titre décoratif de section reprend le libellé par défaut.
      script: fields.value.script || fields.value.label,
      position: fields.value.position,
      active: bool(body.active, true),
    },
  });

  return NextResponse.json(toView(row), { status: 201 });
}

/**
 * PATCH /api/categories — modification, **administration uniquement**.
 * Le `slug` désigne la catégorie à modifier ; il n'est jamais réécrit, sans
 * quoi tous les plats de la section se retrouveraient orphelins.
 */
export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<CategoryBody>(req);
  if (!body) return badRequest("Requête invalide");

  const key = str(body.slug, "L'identifiant", { min: 2, max: 40 });
  if (!key.ok) return badRequest(key.error);

  const data: { label?: string; script?: string; position?: number; active?: boolean } = {};

  if (body.label !== undefined) {
    const v = str(body.label, "Le libellé", { min: 2, max: 60 });
    if (!v.ok) return badRequest(v.error);
    data.label = v.value;
  }
  if (body.script !== undefined) {
    const v = str(body.script, "Le titre décoratif", { max: 60, required: false });
    if (!v.ok) return badRequest(v.error);
    data.script = v.value;
  }
  if (body.position !== undefined) {
    const v = int(body.position, "La position", { min: 0, max: 999 });
    if (!v.ok) return badRequest(v.error);
    data.position = v.value;
  }
  if (body.active !== undefined) data.active = bool(body.active);

  if (Object.keys(data).length === 0) return badRequest("Aucune modification demandée");

  try {
    const row = await prisma.category.update({ where: { slug: key.value }, data });
    return NextResponse.json(toView(row));
  } catch {
    return notFound("Catégorie introuvable");
  }
}
