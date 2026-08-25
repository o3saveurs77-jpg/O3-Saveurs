import type { Metadata } from "next";
import { SectionList } from "@/components/sections/SectionBlock";
import { loadPage } from "@/lib/pageContent";
import { JsonLd } from "@/components/JsonLd";
import { loadSeoContext } from "@/lib/seoData";
import { graph, restaurantNode, websiteNode, faqNode } from "@/lib/seo";

export const metadata: Metadata = {
  /* `title.absolute` court-circuite le gabarit du layout : l'accueil porte le
   * titre complet, sans que la marque y soit ajoutée une seconde fois.
   *
   * La marque **ouvre** le titre. Elle le fermait — « Restaurant africain &
   * maghrébin à Pontault-Combault · Ô 3 Saveurs » — ce qui est le bon ordre
   * pour une requête générique (« restaurant africain 77 ») et le mauvais pour
   * une requête de marque (« o3 saveurs »), la seule que tapent les gens à qui
   * on a tendu une carte de visite. Les deux mots-clés restent dans le titre,
   * ils ont simplement cédé la première place. */
  title: {
    absolute: "Ô 3 Saveurs · Restaurant africain & maghrébin à Pontault-Combault",
  },
  description:
    "Ô 3 Saveurs — Chez Laila : cuisine d'Afrique de l'Ouest, du Maghreb et de Méditerranée préparée maison à Pontault-Combault. Commande en ligne, livraison et à emporter.",
  alternates: { canonical: "/" },
};

/* L'accueil décrivait sa mise en page en dur : les trois univers, le teaser
 * « notre histoire », les étapes de commande et jusqu'aux titres étaient des
 * tableaux figés dans ce fichier. La cliente ne pouvait ni corriger un texte,
 * ni ajouter un encart, ni masquer une section — il fallait un développeur et
 * un déploiement pour chaque virgule.
 *
 * La page est désormais la mise bout à bout des sections rangées en base
 * (`PageSection`), modifiables depuis Back-office › Contenu du site. Les blocs
 * reliés aux données métier — plats mis en avant, plat du jour, formules,
 * zones — continuent de puiser à leur source : un prix n'a qu'une seule
 * origine, et l'éditeur ne peut pas en inventer une seconde.
 *
 * `revalidate` reste un filet : l'enregistrement d'une section purge déjà le
 * cache de la page (voir `app/api/page-sections`). */
export const revalidate = 300;

export default async function HomePage() {
  /* Les deux lectures sont indépendantes : les enchaîner ajouterait un
   * aller-retour à la base sur la page la plus visitée du site. */
  const [{ sections, ctx }, seo] = await Promise.all([loadPage("accueil"), loadSeoContext()]);

  /* Le graphe du restaurant vit sur l'accueil, pas dans le layout : le layout
   * est synchrone et sert aussi l'administration — l'y monter ajouterait une
   * requête à chacun des vingt-et-un écrans du back-office pour un balisage
   * que personne n'y lit. */
  const jsonLd = graph([
    restaurantNode({
      profile: seo.profile,
      hours: seo.hours,
      zones: seo.zones,
      dishes: seo.dishes,
      acceptsCash: seo.acceptsCash,
      acceptsCard: seo.acceptsCard,
    }),
    websiteNode(seo.profile),
    faqNode({
      profile: seo.profile,
      zones: seo.zones,
      hours: seo.hours,
      leadTimeMinutes: seo.leadTimeMinutes,
      acceptsCash: seo.acceptsCash,
      acceptsCard: seo.acceptsCard,
      hoursLabels: seo.hoursLabels,
    }),
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <SectionList sections={sections} ctx={ctx} />
    </>
  );
}
