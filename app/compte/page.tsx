import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountClient } from "@/components/account/AccountClient";

export const metadata: Metadata = {
  title: "Mon compte · Ô 3 Saveurs — Chez Laila",
};

/* La page lit la session : elle ne peut pas être prérendue au build. */
export const dynamic = "force-dynamic";

/**
 * Espace client — ou back-office, pour une administratrice.
 *
 * Un compte ADMIN n'a rien à faire sur un écran de suivi de commandes
 * personnelles : arriver là après s'être connecté donnait l'impression que la
 * connexion n'avait pas « pris », alors que le back-office était accessible en
 * tapant son adresse. La redirection l'y mène directement.
 *
 * Le retour reste possible depuis « Retour au site » dans le back-office, et
 * `?client=1` force l'affichage de l'espace client pour qui veut le vérifier —
 * sans cela, plus personne ne pourrait relire cette page une fois nommé
 * administrateur.
 */
export default async function ComptePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (role === "ADMIN" && params.client !== "1") redirect("/admin");

  return <AccountClient />;
}
