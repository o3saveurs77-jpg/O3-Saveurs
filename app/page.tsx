import { SectionList } from "@/components/sections/SectionBlock";
import { loadPage } from "@/lib/pageContent";

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
  const { sections, ctx } = await loadPage("accueil");
  return <SectionList sections={sections} ctx={ctx} />;
}
