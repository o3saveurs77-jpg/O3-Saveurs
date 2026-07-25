/* Confirmation d'inscription à la newsletter (second temps du double opt-in).
 *
 * La route est en `GET` parce qu'elle est atteinte par un clic dans un email :
 * aucun client de messagerie n'envoie de `POST`. Le jeton est un secret à
 * usage unique dans les faits (confirmer deux fois est sans effet), et
 * l'opération est idempotente — c'est ce qui rend acceptable un effet de bord
 * sur un `GET` ici.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function back(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/newsletter/confirmation", new URL(req.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** GET /api/newsletter/confirm?token=… — valide le consentement, puis redirige. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return back(req, { etat: "invalide" });

  const row = await prisma.newsletterSubscriber.findUnique({ where: { token } });
  if (!row) return back(req, { etat: "invalide" });

  // Une adresse désinscrite ne se réactive pas par un vieux lien de
  // confirmation : il faut repasser par le formulaire d'inscription.
  if (row.unsubscribedAt) return back(req, { etat: "desinscrit" });

  if (row.confirmed) return back(req, { etat: "deja" });

  await prisma.newsletterSubscriber.update({
    where: { id: row.id },
    data: { confirmed: true, confirmedAt: new Date() },
  });

  return back(req, { etat: "ok" });
}
