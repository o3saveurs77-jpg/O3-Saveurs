import type { Metadata } from "next";
import { Bricolage_Grotesque, Archivo, Yellowtail } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/components/cart/CartContext";
import { AuthProvider } from "@/components/providers/AuthContext";
import { OrdersProvider } from "@/components/providers/OrdersContext";
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

export const metadata: Metadata = {
  title: "Ô 3 Saveurs — Chez Laila · Cuisine du monde à Lognes",
  description:
    "Cuisine du monde préparée maison — Afrique, Maghreb, Asie. Commandez en ligne en livraison ou à emporter à Lognes et alentours.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${bricolage.variable} ${archivo.variable} ${yellowtail.variable}`}>
        <AuthProvider>
          <DishesProvider>
            <OrdersProvider>
              <CartProvider>
                <SiteChrome>{children}</SiteChrome>
              </CartProvider>
            </OrdersProvider>
          </DishesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
