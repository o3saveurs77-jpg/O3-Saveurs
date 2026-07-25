import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { info } from "@/lib/menu";

export const metadata: Metadata = {
  title: "Page introuvable · Ô 3 Saveurs — Chez Laila",
  robots: { index: false, follow: true },
};

/** 404 dans la charte, avec les issues utiles plutôt qu'un cul-de-sac. */
export default function NotFound() {
  return (
    <div className="wrap flex flex-col items-center gap-4 py-24 text-center">
      <p className="font-script text-5xl text-teal">404</p>
      <h1 className="text-3xl sm:text-4xl">Cette page n'est pas à la carte</h1>
      <p className="max-w-md text-ink-2">
        Le lien est peut-être ancien, ou l'adresse comporte une faute de frappe. La carte complète,
        elle, est toujours là.
      </p>

      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/carte"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-white transition hover:brightness-105"
        >
          <Icon name="list" size={18} /> Voir la carte
        </Link>
        <Link
          href="/"
          className="rounded-full border border-line bg-panel px-6 py-3 font-semibold hover:bg-panel-2"
        >
          Retour à l'accueil
        </Link>
        <Link
          href="/contact"
          className="rounded-full border border-line bg-panel px-6 py-3 font-semibold hover:bg-panel-2"
        >
          Nous contacter
        </Link>
      </div>

      <p className="mt-4 text-sm text-ink-2">
        Une commande en cours, une question ?{" "}
        <a
          href={`tel:${info.phone.replace(/\s/g, "")}`}
          className="font-semibold text-primary hover:underline"
        >
          {info.phone}
        </a>
      </p>
    </div>
  );
}
