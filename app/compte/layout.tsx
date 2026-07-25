import type { Metadata } from "next";
import { OrdersProvider } from "@/components/providers/OrdersContext";

export const metadata: Metadata = {
  title: "Mon compte",
  // Espace personnel : ne doit pas être indexé.
  robots: { index: false, follow: false },
};

/**
 * `OrdersProvider` est monté ici et non dans le layout racine : c'est le seul
 * endroit du site public où le client consulte ses commandes. Auparavant monté à
 * la racine, il faisait télécharger la liste complète des commandes à chaque
 * visiteur, sur chaque page.
 */
export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return <OrdersProvider>{children}</OrdersProvider>;
}
