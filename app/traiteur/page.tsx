import type { Metadata } from "next";
import { TraiteurClient } from "@/components/traiteur/TraiteurClient";
import { JsonLd } from "@/components/JsonLd";
import { loadSeoContext } from "@/lib/seoData";
import { graph, cateringNode, restaurantNode, breadcrumbNode, pageMetadata } from "@/lib/seo";

/* Description, canonique et image de partage : `lib/seo.ts`. */
export const metadata: Metadata = pageMetadata({
  path: "/traiteur",
  title: "Traiteur à Pontault-Combault",
  accroche:
    "Buffets, plateaux repas et réceptions à Pontault-Combault — devis gratuit sous 24 h.",
});

/* Même cadence que les autres pages vitrine : le balisage suit les réglages. */
export const revalidate = 300;

/* La page n'avait aucun balisage — ni service, ni fil d'Ariane, ni rattachement
 * au restaurant. Elle vise pourtant les requêtes les plus rémunératrices du
 * site (« traiteur mariage 77 », « plateaux repas entreprise »), où l'on est en
 * concurrence avec des traiteurs qui, eux, sont balisés. */
export default async function TraiteurPage() {
  const seo = await loadSeoContext();

  const jsonLd = graph([
    /* Le `Service` se déclare rendu par `#restaurant` — encore faut-il que ce
     * nœud existe ici. Un moteur lit chaque page isolément : une référence
     * `@id` vers un nœud défini seulement sur l'accueil ne se résout pas, et
     * le service sortait donc sans prestataire, sans adresse et sans horaires.
     * C'est pourtant ce qui décide un client qui cherche un traiteur près de
     * chez lui. */
    restaurantNode({
      profile: seo.profile,
      hours: seo.hours,
      zones: seo.zones,
      dishes: seo.dishes,
      acceptsCash: seo.acceptsCash,
      acceptsCard: seo.acceptsCard,
    }),
    cateringNode(seo.profile, seo.zones),
    breadcrumbNode([
      { name: "Accueil", path: "/" },
      { name: "Traiteur", path: "/traiteur" },
    ]),
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <TraiteurClient />
    </>
  );
}
