import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToDish, dishToRow } from "@/lib/serialize";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { collect, str } from "@/lib/validate";
import { validateDishFields } from "@/lib/dishValidation";
import type { Dish } from "@/lib/menu";

export const dynamic = "force-dynamic";

/** GET /api/dishes — catalogue public. Seule route de ce fichier ouverte à tous. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const onlyAvailable = url.searchParams.get("available") === "true";

  const rows = await prisma.dish.findMany({
    where: onlyAvailable ? { available: true } : undefined,
    orderBy: [{ cat: "asc" }, { position: "asc" }],
  });
  return NextResponse.json(rows.map(rowToDish));
}

/**
 * POST /api/dishes — création d'un plat, **administration uniquement**.
 * Cette route était ouverte : n'importe qui pouvait ajouter ou modifier des
 * plats, et donc mettre tous les prix à 0,01 € avant de commander.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<Partial<Dish>>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({
    cat: str(body.cat, "La catégorie", { max: 40 }),
    name: str(body.name, "Le nom", { min: 2, max: 120 }),
    desc: str(body.desc, "La description", { max: 500, required: false }),
  });
  if (!fields.ok) return badRequest(fields.error);

  const priced = validateDishFields(body);
  if (!priced.ok) return badRequest(priced.error);

  const count = await prisma.dish.count({ where: { cat: fields.value.cat } });

  const row = await prisma.dish.create({
    data: {
      ...dishToRow({ ...body, ...priced.value }),
      cat: fields.value.cat,
      name: fields.value.name,
      desc: fields.value.desc,
      position: count,
    } as never,
  });

  return NextResponse.json(rowToDish(row), { status: 201 });
}
