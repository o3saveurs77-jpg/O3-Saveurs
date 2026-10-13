/* Atterrissage du lien « Se désinscrire » présent dans chaque campagne.
 *
 * `GET /api/newsletter/unsubscribe?token=…` horodate l'opposition en base, puis
 * redirige ici avec `?etat=…`. Cette page n'existait pas : l'adresse renvoyait
 * une 404 en production. La désinscription était donc bien enregistrée, mais
 * invisible — et une opposition invisible se solde par un clic sur « signaler
 * comme indésirable », qui abîme la réputation du domaine pour tous les emails
 * du restaurant, confirmations de commande et factures comprises.
 *
 * L'affichage est le dernier maillon d'une obligation : l'opposition doit être
 * effective et la personne doit pouvoir le constater (art. L34-5 CPCE,
 * RGPD art. 21).
 */

import type { Metadata } from "next";
import { PanneauNewsletter } from "../PanneauNewsletter";
import { panneauDesinscription } from "../etats";

export const metadata: Metadata = {
  title: "Désinscription de la newsletter",
  description:
    "Confirmation de votre désinscription de la newsletter du restaurant Ô 3 Saveurs — Chez Laila.",
  alternates: { canonical: "/newsletter/desinscription" },
  /* Page de service atteinte par un lien personnel : rien à indexer, mais les
   * liens continuent de transmettre leur poids. */
  robots: { index: false, follow: true },
};

export default async function NewsletterDesinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PanneauNewsletter kicker="Désinscription" panneau={panneauDesinscription(params.etat)} />
  );
}
