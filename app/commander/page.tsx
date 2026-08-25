import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

export const metadata: Metadata = {
  title: "Commander",
  description:
    "Finalisez votre commande Ô 3 Saveurs : livraison à Pontault-Combault et alentours, ou retrait au restaurant.",
  alternates: { canonical: "/commander" },
  /* Tunnel de commande : pour un robot, qui arrive toujours avec un panier
   * vide, la page ne contient que « Votre panier est vide ». L'indexer, c'est
   * proposer une page creuse en résultat de recherche et dépenser du budget
   * d'exploration ailleurs que sur la carte. `follow` reste : les liens de la
   * page continuent de transmettre leur poids. */
  robots: { index: false, follow: true },
};

export default function CommanderPage() {
  return (
    <>
      <header className="bg-primary text-white">
        <div className="wrap py-10 text-center">
          <h1 className="text-3xl sm:text-4xl">Votre commande</h1>
          <p className="mt-2 text-white/90">Livraison ou à emporter — quelques étapes et c'est prêt.</p>
        </div>
        <div className="ots-band" />
      </header>
      <CheckoutClient />
    </>
  );
}
