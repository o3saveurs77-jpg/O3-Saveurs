/* Désinscription de la newsletter (RGPD, art. 21 — droit d'opposition).
 *
 * Contraintes réglementaires respectées ici :
 *  · **un seul clic** suffit, aucune étape de confirmation ;
 *  · **aucune connexion** n'est demandée — exiger un compte pour se désinscrire
 *    est un obstacle non conforme ;
 *  · le jeton est porté par le lien présent dans chaque campagne.
 *
 * L'enregistrement n'est pas supprimé mais horodaté : il faut pouvoir prouver
 * que l'opposition a été respectée, et empêcher une réinscription silencieuse
 * lors d'un futur import de fichier.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function back(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/newsletter/desinscription", new URL(req.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** GET /api/newsletter/unsubscribe?token=… — désinscrit puis redirige. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return back(req, { etat: "invalide" });

  const row = await prisma.newsletterSubscriber.findUnique({ where: { token } });
  if (!row) return back(req, { etat: "invalide" });

  if (row.unsubscribedAt) return back(req, { etat: "deja" });

  // `confirmed` est laissé tel quel : il enregistre qu'un consentement a bien
  // été donné à l'époque. C'est `unsubscribedAt` qui exclut l'adresse des
  // envois, et lui seul.
  await prisma.newsletterSubscriber.update({
    where: { id: row.id },
    data: { unsubscribedAt: new Date() },
  });

  return back(req, { etat: "ok" });
}
