import type { Metadata } from "next";
import { TraiteurClient } from "@/components/traiteur/TraiteurClient";

export const metadata: Metadata = {
  title: "Traiteur à Pontault-Combault",
  description:
    "Buffets, plateaux repas et service sur place pour vos réunions de bureau, mariages et réceptions à Pontault-Combault et en Seine-et-Marne. Devis gratuit sous 24 h.",
  alternates: { canonical: "/traiteur" },
  openGraph: {
    title: "Traiteur · Ô 3 Saveurs — Chez Laila",
    description:
      "Buffets, plateaux repas et réceptions à Pontault-Combault — devis gratuit sous 24 h.",
    url: "/traiteur",
  },
};

export default function TraiteurPage() {
  return <TraiteurClient />;
}
