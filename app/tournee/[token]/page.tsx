import type { Metadata } from "next";
import { TourneeClient } from "@/components/tournee/TourneeClient";

/**
 * Tournée du livreur, ouverte par lien privé.
 *
 * `noindex, nofollow` : la page porte des adresses et des téléphones de
 * clients. Le jeton la rend introuvable, mais un lien collé quelque part ne
 * doit pas non plus finir dans un moteur de recherche.
 */
export const metadata: Metadata = {
  title: "Ma tournée · Ô 3 Saveurs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TourneePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TourneeClient endpoint={`/api/tournee/${token}`} />;
}
