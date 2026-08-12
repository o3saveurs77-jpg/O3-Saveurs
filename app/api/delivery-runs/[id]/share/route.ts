import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, notFound } from "@/lib/guard";
import { makeRunToken } from "@/lib/ref";
import { accessExpiry, RUN_ACCESS_HOURS } from "@/lib/deliveryAccess";

export const dynamic = "force-dynamic";

/**
 * POST /api/delivery-runs/[id]/share — engendre le lien privé de la tournée.
 * **Administration uniquement.**
 *
 * Rappelé une seconde fois, il **remplace** le lien précédent : c'est le geste
 * de révocation, celui qui coupe l'accès d'un livreur qui s'en va ou d'un lien
 * transmis par erreur. Aucune confirmation n'est demandée — régénérer est sans
 * danger, il suffit de renvoyer le nouveau lien.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const run = await prisma.deliveryRun.findUnique({
    where: { id },
    include: { driver: { select: { name: true } } },
  });
  if (!run) return notFound("Tournée introuvable");

  const accessToken = makeRunToken();
  const accessExpiresAt = accessExpiry();

  await prisma.deliveryRun.update({ where: { id }, data: { accessToken, accessExpiresAt } });

  const origin = process.env.NEXTAUTH_URL ?? "";
  const url = `${origin}/tournee/${accessToken}`;

  return NextResponse.json({
    url,
    expiresAt: accessExpiresAt.toISOString(),
    validHours: RUN_ACCESS_HOURS,
    driverName: run.driver.name,
    /* Prêt à coller dans un SMS : le livreur reçoit le contexte, pas une URL
     * nue qu'il prendrait pour un message frauduleux. */
    message:
      `Ô 3 Saveurs — votre tournée : ${url}\n` +
      `Lien personnel, valable ${RUN_ACCESS_HOURS} h. Ne le transmettez pas.`,
  });
}
