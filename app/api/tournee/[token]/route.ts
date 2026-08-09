import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, badRequest } from "@/lib/guard";
import { checkRunAccess } from "@/lib/deliveryAccess";
import { applyStopAction, runPayload, RUN_INCLUDE, type RunWithOrders } from "@/lib/runBoard";

export const dynamic = "force-dynamic";

/**
 * Tournée d'un livreur, ouverte par un lien privé — **sans compte**.
 *
 * Le jeton de l'URL *est* l'autorisation : le livreur reçoit son lien par SMS
 * et l'ouvre sur son téléphone. C'est ce qui permet de faire rouler un extra
 * embauché le matin même.
 *
 * Deux conséquences, tenues ici et dans `lib/deliveryAccess.ts` :
 *
 *  · le jeton est revérifié **à chaque appel**, y compris pour les écritures.
 *    Un lien expiré ou remplacé ne fait plus rien ;
 *  · on ne renvoie que les arrêts de cette tournée, et rien d'autre. Pas de
 *    liste de clients, pas d'historique, pas de chiffre d'affaires.
 *
 * Le contenu de la réponse et les actions vivent dans `lib/runBoard.ts`,
 * partagé avec l'accès par compte (`/api/livreur/tournee`) : les deux portes
 * doivent se comporter exactement pareil.
 */
async function loadRun(token: string) {
  return prisma.deliveryRun.findUnique({ where: { accessToken: token }, include: RUN_INCLUDE });
}

/** GET /api/tournee/[token] — la tournée et ses arrêts. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const run = await loadRun(token);

  const access = checkRunAccess(run, token);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json(runPayload(run as unknown as RunWithOrders));
}

/** POST /api/tournee/[token] — livrer, encaisser ou signaler un problème. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const run = await loadRun(token);

  const access = checkRunAccess(run, token);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await readJson<Record<string, unknown>>(req)) ?? {};
  const result = await applyStopAction(run as unknown as RunWithOrders, {
    orderId: typeof body.orderId === "string" ? body.orderId : "",
    action: typeof body.action === "string" ? body.action : "",
    code: typeof body.code === "string" ? body.code : "",
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : "",
  });

  if (!result.ok) return badRequest(result.error);
  return NextResponse.json(result);
}
