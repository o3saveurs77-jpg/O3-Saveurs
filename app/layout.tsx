import type { Metadata } from "next";
import { Bricolage_Grotesque, Archivo, Yellowtail } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/components/cart/CartContext";
import { AuthProvider } from "@/components/providers/AuthContext";
import { DishesProvider } from "@/components/providers/DishesContext";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["400", "600", "700", "800"],
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const yellowtail = Yellowtail({
  subsets: ["latin"],
  variable: "--font-yellowtail",
  display: "swap",
  weight: "400",
});

const SITE_URL = process.env.NEXTAUTH_URL ?? "https://o3saveurs.fr";

export const metadata: Metadata = {
  // `metadataBase` manquait : sans elle, toute URL Open Graph ou canonique est
  // relative, donc cassée dans les aperçus de partage.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Lognes",
    template: "%s · Ô 3 Saveurs",
  },
  description:
    "Cuisine du monde préparée maison — Afrique, Maghreb, Asie. Commandez en ligne en livraison ou à emporter à Lognes et alentours.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Ô 3 Saveurs — Chez Laila",
    title: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Lognes",
    description:
      "Afrique, Maghreb, Asie — préparé maison, livré chez vous à Lognes et alentours.",
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
      <body className={`${bricolage.variable} ${archivo.variable} ${yellowtail.variable}`}>
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
