/* Atterrissage du clic « Je confirme » de l'email de double opt-in.
 *
 * `GET /api/newsletter/confirm?token=…` valide le consentement en base, puis
 * redirige ici avec `?etat=…`. Cette page n'existait pas : l'adresse renvoyait
 * une 404 en production. L'inscription était pourtant bien enregistrée — la
 * personne, elle, repartait convaincue du contraire, et beaucoup se
 * réinscrivaient deux ou trois fois de suite.
 */

import type { Metadata } from "next";
import { PanneauNewsletter } from "../PanneauNewsletter";
import { panneauConfirmation } from "../etats";

export const metadata: Metadata = {
  title: "Inscription à la newsletter",
  description:
    "Confirmation de votre inscription à la newsletter du restaurant Ô 3 Saveurs.",
  alternates: { canonical: "/newsletter/confirmation" },
  /* Page de service, atteinte par un lien personnel et sans intérêt dans une
   * page de résultats : l'indexer dépenserait du budget d'exploration au
   * détriment de la carte. `follow` reste, pour que ses liens comptent. */
  robots: { index: false, follow: true },
};

export default async function NewsletterConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PanneauNewsletter kicker="Newsletter" panneau={panneauConfirmation(params.etat)} />
  );
}
