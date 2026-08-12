import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, readJson, badRequest, notFound } from "@/lib/guard";
import { parisStartOfDay } from "@/lib/hours";
import { applyStopAction, runPayload, RUN_INCLUDE, type RunWithOrders } from "@/lib/runBoard";

export const dynamic = "force-dynamic";

/**
 * Tournée du livreur **connecté** — rôle LIVREUR, ou ADMIN pour vérifier.
 *
 * Seconde porte d'entrée, à côté du lien privé. Elle sert le livreur permanent
 * qui préfère ouvrir le site plutôt que retrouver un SMS ; l'extra du jour
 * continue d'utiliser le lien, sans compte.
 *
 * Le rattachement se fait par **email** : la fiche livreur porte l'adresse du
 * compte Auth0. Sans elle, la session ne peut être reliée à aucune tournée —
 * et le message le dit, plutôt que d'afficher une page vide.
 */
async function currentRun(email: string) {
  const driver = await prisma.driver.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!driver) return { driver: null, run: null };

  /* La tournée du jour qui n'est pas terminée. Une tournée close n'a plus à
   * être modifiable depuis la rue. */
  const run = await prisma.deliveryRun.findFirst({
    where: {
      driverId: driver.id,
      date: { gte: parisStartOfDay() },
      status: { in: ["preparee", "en_cours"] },
    },
    orderBy: { date: "asc" },
    include: RUN_INCLUDE,
  });

  return { driver, run };
}

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (guard.user.role !== "LIVREUR" && guard.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Accès réservé aux livreurs." }, { status: 403 });
  }

  const { driver, run } = await currentRun(guard.user.email);

  if (!driver) {
    return NextResponse.json(
      {
        error:
          "Votre compte n'est rattaché à aucune fiche livreur. Demandez au restaurant " +
          "d'y renseigner votre adresse email (Back-office → Livreurs).",
      },
      { status: 404 },
    );
  }
  if (!run) {
    return NextResponse.json(
      { error: `Aucune tournée en cours pour ${driver.name} aujourd'hui.` },
      { status: 404 },
    );
  }

  return NextResponse.json(runPayload(run as unknown as RunWithOrders));
}

export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (guard.user.role !== "LIVREUR" && guard.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Accès réservé aux livreurs." }, { status: 403 });
  }

  const { run } = await currentRun(guard.user.email);
  if (!run) return notFound("Aucune tournée en cours.");

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
