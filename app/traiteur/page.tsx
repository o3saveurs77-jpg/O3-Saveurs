import type { Metadata } from "next";
import { TraiteurClient } from "@/components/traiteur/TraiteurClient";

export const metadata: Metadata = {
  title: "Traiteur · Ô 3 Saveurs — Chez Laila",
  description:
    "Buffets, plateaux repas et service sur place pour vos réunions de bureau, mariages et réceptions à Pontault-Combault. Devis gratuit sous 24 h.",
  alternates: { canonical: "/traiteur" },
};

export default function TraiteurPage() {
  return <TraiteurClient />;
}
