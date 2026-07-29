/* Réglages du restaurant (back-office).
 *
 * Les réglages sont lus côté serveur et passés au formulaire : pas d'aller-retour
 * réseau au montage, donc pas d'écran de chargement.
 *
 * Contrairement aux pages légales, aucun repli silencieux sur les valeurs par
 * défaut ici : si la base est injoignable, l'erreur doit remonter, faute de quoi
 * la cliente croirait modifier des réglages enregistrés.
 */

import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { ReglagesAdmin } from "@/components/admin/ReglagesAdmin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Réglages · Back-office Ô 3 Saveurs",
  robots: { index: false, follow: false },
};

export default async function AdminReglagesPage() {
  const settings = await getSettings();
  return <ReglagesAdmin initial={settings} />;
}
