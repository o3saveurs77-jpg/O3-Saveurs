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
  SurCommandeBlock,
  ZonesBlock,
} from "@/components/sections/DynamicBlocks";

/**
 * La section porte-t-elle une photo, et peut-on le savoir ici ?
 *
 * Sert à désigner l'image d'ouverture de la page (voir `SectionList`). Seuls
 * les blocs éditoriaux répondent : le contenu des blocs reliés à la base
 * dépend du contexte — plats du moment, formules, pièces sur commande — et
 * dépenser la seule priorité disponible sur une grille qui peut se révéler
 * vide la ferait perdre pour toute la page.
 */
function hasPhoto(section: PageSectionView): boolean {
  const { kind, content } = section;
  // Le bandeau retombe sur un visuel du catalogue : il a toujours une photo.
  if (kind === "hero") return true;
  if (kind === "cartes") return content.items.some((item) => item.photo);
  if (kind === "texte_images" || kind === "galerie") return content.photos.length > 0;
  return false;
}

export function SectionBlock({
  section,
  ctx,
  anchor,
  lead = false,
}: {
  section: PageSectionView;
  ctx: SectionContext;
  /** Ancre HTML, pour les liens « Découvrir nos univers » du bandeau. */
  anchor?: string;
  /** Cette section ouvre la page en image : sa première photo est préchargée. */
  lead?: boolean;
}) {
  const { kind, content } = section;

  switch (kind) {
    case "hero":
      // Le bandeau pose lui-même la priorité sur sa photo de fond : s'il est
      // là, c'est lui qui reçoit `lead` et aucun autre bloc ne la réclame.
      return <Hero content={content} dishes={ctx.heroDishes} />;
    case "entete":
      return <EnteteBlock content={content} />;
    case "cartes":
      return <CartesBlock content={content} id={anchor} lead={lead} />;
    case "atouts":
      return <AtoutsBlock content={content} />;
    case "etapes":
      return <EtapesBlock content={content} />;
    case "tarifs":
      return <TarifsBlock content={content} />;
    case "texte_images":
      return <TexteImagesBlock content={content} lead={lead} />;
    case "galerie":
      return <GalerieBlock content={content} lead={lead} />;
    case "appel_action":
      return <AppelActionBlock content={content} />;
    case "plats_populaires":
      return <PlatsPopulairesBlock content={content} ctx={ctx} />;
    case "plat_du_jour":
      return <PlatDuJourBlock content={content} ctx={ctx} />;
    case "formules":
      return <FormulesBlock content={content} ctx={ctx} />;
    case "sur_commande":
      return <SurCommandeBlock content={content} ctx={ctx} />;
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
 *
 * C'est aussi ici que se décide **la** photo prioritaire de la page, et pas
 * dans les blocs. Un bloc ne sait pas où il a été rangé : une galerie placée
 * en tête de page ouvre l'écran, la même galerie placée en pied n'a aucune
 * raison de passer devant le reste. Et la priorité ne se partage pas — Next
 * émet un `<link rel="preload">` par image prioritaire, si bien que deux
 * images « prioritaires » se gênent et n'en laissent aucune arriver tôt. La
 * liste ordonnée étant connue ici, la première section illustrée la reçoit, et
 * elle seule : toutes les autres photos restent en chargement différé, ce
 * qu'elles sont déjà par défaut avec `next/image`.
 */
export function SectionList({
  sections,
  ctx,
}: {
  sections: PageSectionView[];
  ctx: SectionContext;
}) {
  const anchorId = sections.find((s) => s.kind === "cartes")?.id;
  const leadId = sections.find(hasPhoto)?.id;

  return (
    <>
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          ctx={ctx}
          anchor={section.id === anchorId ? "saveurs" : undefined}
          lead={section.id === leadId}
        />
      ))}
    </>
  );
}
