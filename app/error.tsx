"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { info } from "@/lib/menu";

/**
 * Frontière d'erreur du site. Sans ce fichier, la moindre exception dans un
 * composant client produisait un écran blanc sans recours.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[site] erreur non rattrapée:", error);
  }, [error]);

  return (
    <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-brick">
        <Icon name="warning" size={32} />
      </div>
      <p className="font-script text-3xl text-teal">Oups</p>
      <h1 className="text-3xl sm:text-4xl">Un imprévu en cuisine</h1>
      <p className="max-w-md text-ink-2">
        Cette page n'a pas pu s'afficher. Rien n'est perdu : votre panier est conservé. Réessayez, ou
        appelez-nous — on prend votre commande par téléphone avec plaisir.
      </p>

      {error.digest && (
        <p className="text-xs text-ink-2">
          Référence technique : <code className="font-mono">{error.digest}</code>
        </p>
      )}

      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105"
        >
          <Icon name="refresh" size={18} /> Réessayer
        </button>
        <Link
          href="/"
          className="rounded-full border border-line bg-panel px-6 py-3 font-semibold hover:bg-panel-2"
        >
          Retour à l'accueil
        </Link>
        <a
          href={`tel:${info.phone.replace(/\s/g, "")}`}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 font-semibold hover:bg-panel-2"
        >
          <Icon name="phone" size={18} /> {info.phone}
        </a>
      </div>
    </div>
  );
}
