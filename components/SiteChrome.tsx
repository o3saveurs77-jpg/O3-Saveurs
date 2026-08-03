"use client";

import { usePathname } from "next/navigation";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

/** Masque la nav/footer publics sur le back-office (/admin a son propre chrome). */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  // Sans `min-h-dvh` + `flex-1`, une page courte (ex. l'onglet Favoris vide de
  // /compte) finissait plus tôt que l'écran : le pied de page remontait juste
  // sous le contenu au lieu de rester ancré en bas, contrairement au
  // back-office (`AdminShell`, qui a déjà `min-h-dvh`).
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
