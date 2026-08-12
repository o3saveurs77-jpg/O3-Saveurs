import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/components/cart/CartContext";
import { AuthProvider } from "@/components/providers/AuthContext";
import { DishesProvider } from "@/components/providers/DishesContext";

/* Polices alignées sur la maquette de référence du client
   (o3-saveurs-site-complet.html) : Playfair Display pour les titres,
   Inter pour le corps de texte — plus de police script séparée, la
   maquette n'en utilise aucune. */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "600", "700", "800"],
  style: ["normal", "italic"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = process.env.NEXTAUTH_URL ?? "https://o3saveurs.fr";

export const metadata: Metadata = {
  // `metadataBase` manquait : sans elle, toute URL Open Graph ou canonique est
  // relative, donc cassée dans les aperçus de partage.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Pontault-Combault",
    template: "%s · Ô 3 Saveurs",
  },
  description:
    "Cuisine du monde préparée maison — Afrique, Maghreb, Méditerranée. Commandez en ligne en livraison ou à emporter à Pontault-Combault et alentours.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Ô 3 Saveurs — Chez Laila",
    title: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Pontault-Combault",
    description:
      "Afrique, Maghreb, Méditerranée — préparé maison, livré chez vous à Pontault-Combault et alentours.",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        {/* `.reveal` part à `opacity: 0` et n'est révélé que par l'observateur
            de `components/Reveal.tsx`. Sans JavaScript, la moitié de l'accueil
            resterait donc invisible alors que son HTML est bien servi. Ce
            filet neutralise l'état de départ dans ce cas précis. */}
        <noscript>
          <style
            dangerouslySetInnerHTML={{
              __html: ".reveal{opacity:1 !important;transform:none !important}",
            }}
          />
        </noscript>
      </head>
      <body className={`${playfair.variable} ${inter.variable}`}>
        {/*
          `OrdersProvider` a été retiré d'ici. Monté dans le layout racine, il
          appelait `/api/orders` au montage sur *toutes* les pages : le
          navigateur de chaque visiteur anonyme téléchargeait l'intégralité du
          fichier clients dès l'accueil. Il n'est désormais monté que là où des
          commandes sont réellement affichées — `app/admin/layout.tsx` et
          `app/compte/layout.tsx`.
        */}
        <AuthProvider>
          <DishesProvider>
            <CartProvider>
              <SiteChrome>{children}</SiteChrome>
            </CartProvider>
          </DishesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
