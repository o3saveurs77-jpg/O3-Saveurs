import type { Metadata } from "next";
import { MenuClient } from "@/components/menu/MenuClient";

export const metadata: Metadata = {
  title: "La Carte · Ô 3 Saveurs — Chez Laila",
  description:
    "Découvrez toute la carte : saveurs africaines, maghrébines et asiatiques, grillades, sandwichs, boissons maison et desserts.",
};

export default function CartePage() {
  return (
    <>
      <header className="bg-primary text-white">
        <div className="ots-band flip" />
        <div className="wrap py-12 text-center">
          <p className="font-script text-3xl text-gold">Bienvenue à table</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">La Carte</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/90">
            Afrique · Maghreb · Asie — tout est préparé maison. Composez votre commande, en
            livraison ou à emporter.
          </p>
        </div>
      </header>

      <MenuClient />
    </>
  );
}
