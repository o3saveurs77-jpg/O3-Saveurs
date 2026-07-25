import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/banners/[id]/click — **publique**, mesure d'efficacité d'un encart.
 *
 * Contraintes de conception :
 *  · l'incrément est **atomique** en base (`{ increment: 1 }`) : deux clics
 *    simultanés ne s'écrasent pas, contrairement à un lire-puis-écrire ;
 *  · la réponse est un **204 sans corps** : rien à parser côté navigateur ;
 *  · une erreur (identifiant inexistant, base indisponible) répond quand même
 *    204. Une statistique ne doit jamais empêcher un clic d'aboutir.
 *
 * Côté client, `BannerSlot` appelle cette route avec `keepalive: true` sans
 * attendre la réponse : la navigation part immédiatement.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await prisma.banner.update({ where: { id }, data: { clicks: { increment: 1 } } });
  } catch {
    /* encart supprimé entre-temps, ou base indisponible : sans conséquence */
  }

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
