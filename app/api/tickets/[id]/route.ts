/* Réclamation — consultation cloisonnée et traitement par l'administration.
 *
 * `GET` est ouvert au client propriétaire (via `canAccess`) ; toute réclamation
 * qui n'est pas la sienne répond 404. `PATCH` est réservé à l'administration :
 * statut, priorité et geste commercial ne sont pas des champs que le
 * réclamant peut se donner à lui-même.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rowToTicket } from "@/lib/serialize";
import {
  requireUser,
  requireAdmin,
  canAccess,
  readJson,
  badRequest,
  notFound,
  conflict,
  serverError,
} from "@/lib/guard";
import { str, int, oneOf } from "@/lib/validate";
import { makeGestureCode } from "@/lib/ref";
import { TICKET_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

const PRIORITIES = ["basse", "normale", "haute"] as const;
/** Un geste commercial dépasse rarement 200 € ; la borne évite la faute de frappe à 4 zéros. */
const MAX_GESTURE_CENTS = 20_000;

interface Body {
  status?: unknown;
  priority?: unknown;
  /** montant du geste commercial en centimes — déclenche la création du code promo */
  gestureAmountCents?: unknown;
  gestureLabel?: unknown;
}

const INCLUDE = {
  messages: { orderBy: { createdAt: "asc" } },
  order: { select: { ref: true } },
} as const;

/** GET /api/tickets/[id] */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const row = await prisma.supportTicket.findUnique({ where: { id }, include: INCLUDE });
  // Réclamation d'un tiers : 404, jamais 403.
  if (!row || !canAccess(guard.user, row.customerEmail)) return notFound("Réclamation introuvable");

  return NextResponse.json(rowToTicket(row));
}

/** PATCH /api/tickets/[id] — **administration uniquement**. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await readJson<Body>(req);
  if (!body) return badRequest("Requête invalide");

  const current = await prisma.supportTicket.findUnique({ where: { id } });
  if (!current) return notFound("Réclamation introuvable");

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const v = oneOf(body.status, TICKET_STATUSES, "Le statut");
    if (!v.ok) return badRequest(v.error);
    data.status = v.value;
    // Horodatage de clôture, pour mesurer le délai de traitement.
    data.closedAt = v.value === "resolu" || v.value === "ferme" ? new Date() : null;
  }

  if (body.priority !== undefined) {
    const v = oneOf(body.priority, PRIORITIES, "La priorité");
    if (!v.ok) return badRequest(v.error);
    data.priority = v.value;
  }

  // ─── Geste commercial ───
  let gestureCode: string | null = null;

  if (body.gestureAmountCents !== undefined && body.gestureAmountCents !== null) {
    if (current.gestureCode) {
      return conflict(
        `Un geste commercial a déjà été accordé sur cette réclamation (code ${current.gestureCode}).`,
      );
    }

    const amount = int(body.gestureAmountCents, "Le montant du geste", {
      min: 100,
      max: MAX_GESTURE_CENTS,
    });
    if (!amount.ok) return badRequest(amount.error);

    const label = str(body.gestureLabel, "Le libellé du geste", { max: 120, required: false });
    if (!label.ok) return badRequest(label.error);

    try {
      gestureCode = await createGesturePromotion(
        amount.value,
        label.value || `Geste commercial — ${current.customerEmail}`,
      );
    } catch {
      return serverError("Le code de dédommagement n'a pas pu être créé.");
    }

    data.gestureCode = gestureCode;
    data.refundCents = amount.value;
  }

  if (Object.keys(data).length === 0) return badRequest("Aucune modification fournie");

  try {
    const row = await prisma.supportTicket.update({
      where: { id },
      data,
      include: INCLUDE,
    });
    return NextResponse.json(rowToTicket(row));
  } catch {
    return serverError("La réclamation n'a pas pu être enregistrée.");
  }
}

/**
 * Crée la `Promotion` de dédommagement : un montant fixe, en centimes, à usage
 * unique et non cumulable d'un client à l'autre (`oncePerCustomer`).
 * `maxUses: 1` la ferme définitivement après emploi — c'est un dédommagement
 * nominatif, pas une opération commerciale.
 *
 * Le code est tiré aléatoirement sur une colonne `@unique` : on réessaie sur
 * collision (`P2002`) plutôt que de laisser remonter une 500.
 */
async function createGesturePromotion(amountCents: number, label: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeGestureCode();
    try {
      await prisma.promotion.create({
        data: {
          code,
          label,
          kind: "amount",
          value: amountCents,
          oncePerCustomer: true,
          maxUses: 1,
          auto: false,
          active: true,
          // Six mois pour en profiter : au-delà, un code oublié ne doit pas
          // rester encaissable indéfiniment.
          endsAt: new Date(Date.now() + 182 * 24 * 60 * 60 * 1000),
        },
      });
      return code;
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("Impossible de générer un code de dédommagement unique");
}
