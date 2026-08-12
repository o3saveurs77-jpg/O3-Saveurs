/* Édition d'une formule — ADMIN.
 *
 * `PUT` remplace la définition complète : en-tête, créneaux et plats autorisés.
 * Les créneaux envoyés **avec leur identifiant sont mis à jour, pas recréés** :
 * un panier en cours de composition référence ces identifiants, et tout
 * réécrire à chaque enregistrement invaliderait le panier des clients en train
 * de commander.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest, notFound, serverError } from "@/lib/guard";
import { collect, str, int, bool } from "@/lib/validate";
import { rowToFormula } from "@/lib/formulas";

export const dynamic = "force-dynamic";

const FULL = {
  slots: {
    orderBy: { position: "asc" },
    include: { choices: { orderBy: { position: "asc" }, include: { dish: true } } },
  },
} as const;

interface BodySlot {
  id?: unknown;
  label?: unknown;
  required?: unknown;
  choices?: unknown;
}

interface BodyChoice {
  dishId?: unknown;
  supplementCents?: unknown;
}

interface Body {
  code?: unknown;
  name?: unknown;
  desc?: unknown;
  extra?: unknown;
  priceCents?: unknown;
  active?: unknown;
  position?: unknown;
  slots?: unknown;
}

const MAX_SLOTS = 8;
const MAX_CHOICES = 200;

/** Normalise les créneaux reçus, ou explique le premier refus. */
function readSlots(raw: unknown): { ok: true; value: NormalSlot[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "« slots » doit être une liste" };
  if (raw.length > MAX_SLOTS) return { ok: false, error: `${MAX_SLOTS} créneaux au maximum` };

  const out: NormalSlot[] = [];
  for (const [i, item] of raw.entries()) {
    const s = item as BodySlot;
    const label = str(s.label, `Le libellé du créneau ${i + 1}`, { min: 1, max: 60 });
    if (!label.ok) return { ok: false, error: label.error };

    const choicesRaw = Array.isArray(s.choices) ? s.choices : [];
    if (choicesRaw.length > MAX_CHOICES) {
      return { ok: false, error: `Trop de plats dans « ${label.value} »` };
    }

    const choices: NormalChoice[] = [];
    const seen = new Set<string>();
    for (const c of choicesRaw as BodyChoice[]) {
      if (typeof c?.dishId !== "string" || !c.dishId) continue;
      // Un même plat deux fois dans un créneau : la contrainte d'unicité en
      // base le refuserait, autant l'absorber ici.
      if (seen.has(c.dishId)) continue;
      seen.add(c.dishId);

      const supplement = int(c.supplementCents ?? 0, "Le supplément", { min: 0, max: 100_000 });
      if (!supplement.ok) return { ok: false, error: supplement.error };
      choices.push({ dishId: c.dishId, supplementCents: supplement.value });
    }

    out.push({
      id: typeof s.id === "string" && s.id ? s.id : null,
      label: label.value,
      required: bool(s.required, true),
      choices,
    });
  }
  return { ok: true, value: out };
}

interface NormalChoice {
  dishId: string;
  supplementCents: number;
}

interface NormalSlot {
  id: string | null;
  label: string;
  required: boolean;
  choices: NormalChoice[];
}

/** PUT /api/formules/[id] — remplace la définition complète (ADMIN). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
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

  const slots = readSlots(body.slots);
  if (!slots.ok) return badRequest(slots.error);

  const existing = await prisma.formula.findUnique({
    where: { id },
    include: { slots: { select: { id: true } } },
  });
  if (!existing) return notFound("Formule introuvable");

  // Les plats cités doivent exister : un identifiant inventé créerait un
  // créneau qui ne propose rien et une formule impossible à commander.
  const dishIds = [...new Set(slots.value.flatMap((s) => s.choices.map((c) => c.dishId)))];
  if (dishIds.length > 0) {
    const known = await prisma.dish.count({ where: { id: { in: dishIds } } });
    if (known !== dishIds.length) return badRequest("Un plat sélectionné n'existe plus");
  }

  const keptIds = slots.value.map((s) => s.id).filter((v): v is string => Boolean(v));
  const position = int(body.position ?? existing.position, "La position", { min: 0, max: 999 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.formula.update({
        where: { id },
        data: {
          code: fields.value.code.toUpperCase(),
          name: fields.value.name,
          desc: fields.value.desc,
          extra: fields.value.extra,
          priceCents: fields.value.priceCents,
          active: bool(body.active, existing.active),
          position: position.ok ? position.value : existing.position,
        },
      });

      // Créneaux disparus de l'écran d'édition → supprimés (cascade sur leurs choix).
      const removed = existing.slots.map((s) => s.id).filter((sid) => !keptIds.includes(sid));
      if (removed.length > 0) {
        await tx.formulaSlot.deleteMany({ where: { id: { in: removed } } });
      }

      for (const [i, slot] of slots.value.entries()) {
        const data = { label: slot.label, required: slot.required, position: i };

        const slotId = slot.id
          ? (await tx.formulaSlot.update({ where: { id: slot.id }, data })).id
          : (await tx.formulaSlot.create({ data: { ...data, formulaId: id } })).id;

        // Les choix sont peu nombreux et sans état propre : les réécrire est
        // plus sûr qu'un diff, et n'a pas d'incidence sur les paniers en cours
        // (une ligne formule référence le créneau et le plat, pas le choix).
        await tx.formulaChoice.deleteMany({ where: { slotId } });
        if (slot.choices.length > 0) {
          await tx.formulaChoice.createMany({
            data: slot.choices.map((c, k) => ({
              slotId,
              dishId: c.dishId,
              supplementCents: c.supplementCents,
              position: k,
            })),
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return badRequest("Ce code de formule est déjà utilisé.");
    }
    console.error("[formules] enregistrement échoué:", error);
    return serverError("La formule n'a pas pu être enregistrée.");
  }

  const saved = await prisma.formula.findUnique({ where: { id }, include: FULL });
  return NextResponse.json({ formula: saved ? rowToFormula(saved) : null });
}

/** DELETE /api/formules/[id] — retire la formule de la carte (ADMIN). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await prisma.formula.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound("Formule introuvable");

  try {
    await prisma.formula.delete({ where: { id } });
  } catch (error) {
    console.error("[formules] suppression échouée:", error);
    return serverError("La formule n'a pas pu être supprimée.");
  }
  return NextResponse.json({ ok: true });
}
