import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

export const metadata: Metadata = {
  title: "Commander · Ô 3 Saveurs — Chez Laila",
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
