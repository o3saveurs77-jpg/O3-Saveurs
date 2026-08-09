import type { Metadata } from "next";
import { TourneeClient } from "@/components/tournee/TourneeClient";

/**
 * Tournée du livreur connecté.
 *
 * Seconde porte d'entrée, à côté du lien privé reçu par SMS : elle sert le
 * livreur permanent, qui préfère ouvrir le site plutôt que retrouver un
 * message. L'extra du jour continue d'utiliser le lien, sans compte.
 *
 * L'accès est gardé par le middleware (rôle LIVREUR ou ADMIN) et revérifié par
 * l'API, qui rattache la session à une fiche livreur par son email.
 */
export const metadata: Metadata = {
  title: "Ma tournée · Ô 3 Saveurs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function LivreurPage() {
  return <TourneeClient endpoint="/api/livreur/tournee" />;
}
