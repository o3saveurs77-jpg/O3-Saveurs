import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrdersProvider } from "@/components/providers/OrdersContext";

export const metadata: Metadata = {
  title: "Back-office · Ô 3 Saveurs",
  // Le back-office ne doit jamais apparaître dans un moteur de recherche.
  robots: { index: false, follow: false },
};

/**
 * Le middleware garde déjà `/admin/:path*`, mais une seule couche de défense sur
 * l'ensemble du back-office est un point de rupture unique : c'est exactement ce
 * qui a produit les failles de l'audit. Ce contrôle serveur est la seconde
 * couche, et il tourne dans le runtime Node avec accès au rôle réel.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user) redirect("/compte?suivant=/admin");
  if (role !== "ADMIN") redirect("/");

  // `OrdersProvider` est monté ici — et non dans le layout racine — parce que
  // le back-office est le seul endroit qui a besoin de la liste des commandes.
  return (
    <OrdersProvider>
      <AdminShell>{children}</AdminShell>
    </OrdersProvider>
  );
}
