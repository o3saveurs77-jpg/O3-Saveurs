import type { Metadata } from "next";
import { SectionList } from "@/components/sections/SectionBlock";
import { loadPage } from "@/lib/pageContent";
import { JsonLd } from "@/components/JsonLd";
import { loadSeoContext } from "@/lib/seoData";
import { graph, aboutPageNode, breadcrumbNode, restaurantNode, websiteNode, pageMetadata } from "@/lib/seo";

/* Description, canonique et image de partage : `lib/seo.ts`. */
export const metadata: Metadata = pageMetadata({
  path: "/a-propos",
  title: "À propos — l'histoire de Chez Laila",
  accroche: "Une cuisine du monde généreuse, préparée maison à Pontault-Combault.",
});

/* Le récit, les valeurs et les informations pratiques étaient écrits dans ce
 * fichier ; les horaires y étaient même recopiés du catalogue, si bien qu'un
 * changement d'horaire au back-office ne se voyait pas ici.
 *
 * La page assemble maintenant les sections de la base, et le bloc
 * « Informations & horaires » lit les réglages : adresse, téléphone et horaires
 * n'ont plus qu'une seule source. */
export const revalidate = 300;

export default async function AProposPage() {
  const [{ sections, ctx }, seo] = await Promise.all([loadPage("a-propos"), loadSeoContext()]);

  /* La page n'a longtemps porté qu'un fil d'Ariane, au motif qu'un nœud
   * `Restaurant` de plus y répéterait celui de l'accueil. Un moteur lit
   * pourtant chaque page pour elle-même : celle-ci écrivait « Chez Laila » en
   * toutes lettres sans qu'aucun balisage ne dise de quelle entreprise il
   * s'agit. C'est la page faite pour consolider l'entité — nom, enseigne,
   * adresse, horaires, fiche Google — et c'était la seule à n'en rien dire.
   *
   * `AboutPage` ajoute ce que le fil d'Ariane ne dit pas : que cette page
   * *parle de* ce restaurant-là, et non qu'elle se trouve à côté de lui. */
  return (
    <>
      <JsonLd
        data={graph([
          restaurantNode({
            profile: seo.profile,
            hours: seo.hours,
            zones: seo.zones,
            dishes: seo.dishes,
            acceptsCash: seo.acceptsCash,
            acceptsCard: seo.acceptsCard,
          }),
          websiteNode(seo.profile),
          aboutPageNode(seo.profile),
          breadcrumbNode([
            { name: "Accueil", path: "/" },
            { name: "À propos", path: "/a-propos" },
          ]),
        ])}
      />
      <SectionList sections={sections} ctx={ctx} />
    </>
  );
}
