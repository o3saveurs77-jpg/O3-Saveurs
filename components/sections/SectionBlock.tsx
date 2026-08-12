/* Aiguillage : une section en base → le composant qui sait la dessiner.
 *
 * Un `switch` exhaustif plutôt qu'une table de correspondance : le compilateur
 * refuse de compiler si un type de bloc est ajouté au catalogue sans rendu, ce
 * qu'un `Record` partiel laisserait passer jusqu'à la page blanche en prod.
 */

import { Hero } from "@/components/home/Hero";
import type { PageSectionView } from "@/lib/pageSections";
import type { SectionContext } from "@/lib/pageContent";
import {
  AppelActionBlock,
  AtoutsBlock,
  CartesBlock,
  EnteteBlock,
  EtapesBlock,
  GalerieBlock,
  TarifsBlock,
  TexteImagesBlock,
} from "@/components/sections/StaticBlocks";
import {
  FormulesBlock,
  InfosPratiquesBlock,
  PlatDuJourBlock,
  PlatsPopulairesBlock,
  ZonesBlock,
} from "@/components/sections/DynamicBlocks";

export function SectionBlock({
  section,
  ctx,
  anchor,
}: {
  section: PageSectionView;
  ctx: SectionContext;
  /** Ancre HTML, pour les liens « Découvrir nos univers » du bandeau. */
  anchor?: string;
}) {
  const { kind, content } = section;

  switch (kind) {
    case "hero":
      return <Hero content={content} dishes={ctx.heroDishes} />;
    case "entete":
      return <EnteteBlock content={content} />;
    case "cartes":
      return <CartesBlock content={content} id={anchor} />;
    case "atouts":
      return <AtoutsBlock content={content} />;
    case "etapes":
      return <EtapesBlock content={content} />;
    case "tarifs":
      return <TarifsBlock content={content} />;
    case "texte_images":
      return <TexteImagesBlock content={content} />;
    case "galerie":
      return <GalerieBlock content={content} />;
    case "appel_action":
      return <AppelActionBlock content={content} />;
    case "plats_populaires":
      return <PlatsPopulairesBlock content={content} ctx={ctx} />;
    case "plat_du_jour":
      return <PlatDuJourBlock content={content} ctx={ctx} />;
    case "formules":
      return <FormulesBlock content={content} ctx={ctx} />;
    case "zones":
      return <ZonesBlock content={content} ctx={ctx} />;
    case "infos_pratiques":
      return <InfosPratiquesBlock content={content} ctx={ctx} />;
  }
}

/**
 * Toutes les sections d'une page, dans l'ordre.
 *
 * La première section « cartes » reçoit l'ancre `#saveurs` : c'est la cible
 * historique du bouton secondaire du bandeau d'ouverture, et le lien ne doit
 * pas casser parce que la section a été déplacée ou renommée.
 */
export function SectionList({
  sections,
  ctx,
}: {
  sections: PageSectionView[];
  ctx: SectionContext;
}) {
  const anchorId = sections.find((s) => s.kind === "cartes")?.id;

  return (
    <>
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          ctx={ctx}
          anchor={section.id === anchorId ? "saveurs" : undefined}
        />
      ))}
    </>
  );
}
