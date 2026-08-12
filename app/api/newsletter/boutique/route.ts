import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, readJson, badRequest } from "@/lib/guard";
import { collect, email as vEmail } from "@/lib/validate";
import { makeToken } from "@/lib/ref";

export const dynamic = "force-dynamic";

/**
 * POST /api/newsletter/boutique — enregistre l'adresse d'un client du comptoir.
 * **Administration uniquement.**
 *
 * Distincte de l'inscription publique, et pour une raison de fond : la base
 * légale n'est pas la même. Le formulaire du site repose sur le consentement,
 * prouvé par un double opt-in. Ici l'adresse est recueillie *à l'occasion d'une
 * vente*, ce qui autorise la prospection pour des produits analogues sans
 * consentement préalable (art. L34-5 CPCE) — à condition d'informer la personne
 * au moment du recueil, ce que l'écran rappelle mot pour mot.
 *
 * Aucun email de confirmation n'est envoyé : il n'y a rien à confirmer, et en
 * envoyer un laisserait croire à un consentement qu'on ne détient pas.
 *
 * **Seule l'adresse email est collectée.** Ni téléphone, ni adresse postale :
 * on ne garde que ce qui sert à l'envoi (RGPD art. 5.1.c, minimisation).
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJson<{ email?: unknown }>(req);
  if (!body) return badRequest("Requête invalide");

  const fields = collect({ email: vEmail(body.email) });
  if (!fields.ok) return badRequest(fields.error);
  const { email } = fields.value;

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

  if (existing) {
    /* Déjà désinscrit : on ne le réinscrit pas. Il s'est opposé, et une
     * opposition ne s'efface pas parce que la personne repasse au comptoir —
     * il lui faudrait le redemander explicitement, ce qui n'est pas ce
     * formulaire. */
    if (existing.unsubscribedAt) {
      return NextResponse.json({
        ok: false,
        deja: true,
        message: `${email} s'est désinscrit(e) et ne sera pas réinscrit(e).`,
      });
    }

    /* Déjà présent avec un consentement explicite : on n'écrase pas sa base
     * légale par une plus faible. Un opt-in vaut mieux qu'un statut client. */
    return NextResponse.json({
      ok: true,
      deja: true,
      message: `${email} est déjà dans la liste.`,
    });
  }

  await prisma.newsletterSubscriber.create({
    data: {
      email,
      token: makeToken(),
      source: "boutique",
      basis: "client",
      /* `confirmed` reste faux : personne n'a cliqué de lien, et le prétendre
       * fausserait la seule preuve de consentement dont on dispose pour les
       * autres. La joignabilité vient de `basis`, pas de ce champ. */
      confirmed: false,
    },
  });

  return NextResponse.json({
    ok: true,
    deja: false,
    message: `${email} ajouté(e). Il ou elle recevra vos prochaines campagnes.`,
  });
}
