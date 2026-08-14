import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/components/cart/CartContext";
import { AuthProvider } from "@/components/providers/AuthContext";
import { DishesProvider } from "@/components/providers/DishesContext";
import { SITE_URL } from "@/lib/seo";

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

export const metadata: Metadata = {
  // `metadataBase` manquait : sans elle, toute URL Open Graph ou canonique est
  // relative, donc cassée dans les aperçus de partage.
  metadataBase: new URL(SITE_URL),

  /* Le gabarit ne complète que les titres *courts* des pages : chaque page
   * annonce « La Carte », la marque est ajoutée ici. Les pages portaient
   * auparavant leur titre complet — « La Carte · Ô 3 Saveurs — Chez Laila » —
   * auquel le gabarit ajoutait la marque une seconde fois, donnant en résultat
   * de recherche « La Carte · Ô 3 Saveurs — Chez Laila · Ô 3 Saveurs ». */
  title: {
    default: "Restaurant africain & maghrébin à Pontault-Combault · Ô 3 Saveurs",
    template: "%s · Ô 3 Saveurs — Chez Laila",
  },
  description:
    "Cuisine du monde préparée maison — Afrique de l'Ouest, Maghreb, Méditerranée. Commandez en ligne, en livraison ou à emporter, à Pontault-Combault et alentours.",

  /* ⚠️ Pas de `alternates` ici.
   *
   * Le layout déclarait `canonical: "/"`. Next ne fusionne les métadonnées que
   * sur les clés que la page redéfinit (`resolve-metadata.js`, `for key in
   * source`) : toute page sans `alternates` propre héritait donc de cette
   * valeur, déjà résolue en absolu. `/contact`, `/a-propos`, `/commander` et
   * les trois pages légales annonçaient ainsi `rel="canonical"` vers
   * l'accueil — soit, pour Google, l'aveu qu'elles n'en sont que des copies à
   * ne pas indexer. Le canonical se déclare page par page, jamais ici. */

  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: "Ô 3 Saveurs — Chez Laila",
    title: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Pontault-Combault",
    description:
      "Afrique de l'Ouest, Maghreb, Méditerranée — préparé maison, livré chez vous à Pontault-Combault et alentours.",
    /* Photo réelle plutôt que carte générée par `next/og` : la compilation
     * tient dans un gigaoctet (voir `next.config.mjs`) et un rendu 1200×630
     * supplémentaire à chaque build est un risque que l'aperçu de partage ne
     * justifie pas. */
    images: [
      {
        url: "/photos/p03.jpg",
        width: 1600,
        height: 1066,
        alt: "Table dressée de plats Ô 3 Saveurs — tajines, grillades et accompagnements",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Pontault-Combault",
    description:
      "Afrique de l'Ouest, Maghreb, Méditerranée — préparé maison, livré chez vous.",
    images: ["/photos/p03.jpg"],
  },

  /* `max-image-preview: large` autorise Google à afficher la photo du plat en
   * grand dans les résultats — décisif pour un restaurant, où l'image décide
   * du clic. `max-snippet: -1` lève la limite de longueur de l'extrait : c'est
   * ce qui permet aux moteurs génératifs de citer une réponse complète plutôt
   * qu'une phrase tronquée. */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  /* Renseignée seulement si la propriété Search Console est validée par
   * balise ; laissée vide, Next n'émet rien. */
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,

  category: "restaurant",
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
