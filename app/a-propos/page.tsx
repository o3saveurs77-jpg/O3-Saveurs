import type { Metadata } from "next";
import { SectionList } from "@/components/sections/SectionBlock";
import { loadPage } from "@/lib/pageContent";

export const metadata: Metadata = {
  title: "À propos · Ô 3 Saveurs — Chez Laila",
  description:
    "L'histoire de Chez Laila : une cuisine du monde généreuse, préparée maison à Pontault-Combault.",
};

/* Le récit, les valeurs et les informations pratiques étaient écrits dans ce
 * fichier ; les horaires y étaient même recopiés du catalogue, si bien qu'un
 * changement d'horaire au back-office ne se voyait pas ici.
 *
 * La page assemble maintenant les sections de la base, et le bloc
 * « Informations & horaires » lit les réglages : adresse, téléphone et horaires
 * n'ont plus qu'une seule source. */
export const revalidate = 300;

export default async function AProposPage() {
  const { sections, ctx } = await loadPage("a-propos");
  return <SectionList sections={sections} ctx={ctx} />;
}
