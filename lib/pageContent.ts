/* Lecture en base du contenu éditorial des pages vitrine.
 *
 * Pendant que `lib/pageSections.ts` reste pur (types, catalogue, validation),
 * tout ce qui touche à Prisma vit ici : lecture des sections, semis initial et
 * chargement des données métier consommées par les blocs dynamiques.
 *
 * Deux principes :
 *
 * · **La page ne tombe jamais.** Base injoignable ou table vide → le contenu
 *   par défaut de `DEFAULT_SECTIONS` s'affiche. Un incident d'infrastructure
 *   ne doit pas transformer la vitrine en page blanche.
 * · **Une seule source par donnée.** Un bloc « formules » lit la table des
 *   formules, pas un prix ressaisi à la main dans le contenu de la section :
 *   deux sources finissent toujours par se contredire.
 */

import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { rowToDish, rowToZone } from "@/lib/serialize";
import { info, type Dish, type Formula, type Zone } from "@/lib/menu";
import { rowToFormula } from "@/lib/formulas";
import { loadDailySpecial, type PlatDuJourView } from "@/lib/dailySpecial";
import { getSettings, getOpeningHours, formatAddress } from "@/lib/settings";
import { WEEKDAY_LABEL, formatDayHours } from "@/lib/hours";
import {
  DEFAULT_SECTIONS,
  PAGE_PATH,
  normalizeContent,
  isSectionKind,
  type PageSectionView,
  type PageSlug,
  type SectionKind,
} from "@/lib/pageSections";

/**
 * Purge le cache d'une page après une modification de son contenu.
 *
 * Sans cela la cliente enregistrerait sa correction puis la chercherait en
 * vain pendant les cinq minutes de revalidation, et conclurait — à raison —
 * que l'outil ne fonctionne pas.
 */
export function refreshPage(page: PageSlug): void {
  revalidatePath(PAGE_PATH[page]);
}

// ─── Sections ─────────────────────────────────────────────────

/** Ligne Prisma → vue exploitable, contenu validé au passage. */
function rowToSection(row: {
  id: string;
  page: string;
  kind: string;
  label: string;
  position: number;
  visible: boolean;
  contentJson: string;
}): PageSectionView | null {
  if (!isSectionKind(row.kind)) return null; // type retiré du catalogue

  let raw: unknown = {};
  try {
    raw = JSON.parse(row.contentJson);
  } catch {
    /* contenu corrompu : la section s'affiche vide plutôt que de tout casser */
  }

  return {
    id: row.id,
    page: row.page as PageSlug,
    kind: row.kind,
    label: row.label,
    position: row.position,
    visible: row.visible,
    content: normalizeContent(raw),
  };
}

/** Contenu par défaut, présenté comme des sections — sert de repli hors base. */
export function defaultSections(page: PageSlug): PageSectionView[] {
  return DEFAULT_SECTIONS[page].map((s, i) => ({
    id: `defaut-${page}-${i}`,
    page,
    kind: s.kind,
    label: s.label,
    position: i,
    visible: true,
    content: s.content,
  }));
}

/**
 * Écrit le contenu par défaut d'une page si elle n'a aucune section.
 *
 * Appelé au premier affichage de l'écran d'administration : la cliente y
 * retrouve le site tel qu'il est aujourd'hui, et peut le modifier ligne à
 * ligne. Sans ce semis, elle découvrirait une page vide et devrait tout
 * reconstruire de mémoire.
 */
export async function seedPageIfEmpty(page: PageSlug): Promise<void> {
  const count = await prisma.pageSection.count({ where: { page } });
  if (count > 0) return;

  await prisma.pageSection.createMany({
    data: DEFAULT_SECTIONS[page].map((s, i) => ({
      page,
      kind: s.kind,
      label: s.label,
      position: i,
      visible: true,
      contentJson: JSON.stringify(s.content),
    })),
  });
}

/** Toutes les sections d'une page, masquées comprises — pour l'administration. */
export async function loadAllSections(page: PageSlug): Promise<PageSectionView[]> {
  await seedPageIfEmpty(page);
  const rows = await prisma.pageSection.findMany({
    where: { page },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(rowToSection).filter((s): s is PageSectionView => s !== null);
}

/**
 * Sections visibles d'une page, pour le site public.
 *
 * Ne sème rien : une page publique ne doit pas écrire en base (elle est rendue
 * en cache et peut l'être des dizaines de fois en parallèle). Tant que
 * l'administration n'a pas été ouverte, le contenu par défaut fait foi.
 */
export async function loadSections(page: PageSlug): Promise<PageSectionView[]> {
  try {
    const rows = await prisma.pageSection.findMany({
      where: { page, visible: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    const sections = rows.map(rowToSection).filter((s): s is PageSectionView => s !== null);
    return sections.length ? sections : defaultSections(page);
  } catch (error) {
    console.error(`[contenu] lecture des sections « ${page} » échouée:`, error);
    return defaultSections(page);
  }
}

// ─── Données des blocs dynamiques ─────────────────────────────

export interface PracticalInfo {
  address: string;
  phone: string;
  payments: string[];
  partner: string;
  hours: { jour: string; horaire: string }[];
}

export interface SectionContext {
  populaires: Dish[];
  platToday: PlatDuJourView | null;
  zones: Zone[];
  freeDeliveryThresholdCents: number | null;
  formules: Formula[];
  practical: PracticalInfo | null;
}

export const EMPTY_CONTEXT: SectionContext = {
  populaires: [],
  platToday: null,
  zones: [],
  freeDeliveryThresholdCents: null,
  formules: [],
  practical: null,
};

async function loadPopulaires(limit: number): Promise<Dish[]> {
  const rows = await prisma.dish.findMany({
    where: { popular: true, available: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: limit,
  });
  return rows.map(rowToDish);
}

async function loadZones(): Promise<{ zones: Zone[]; freeDeliveryThresholdCents: number | null }> {
  const [zoneRows, freeDeliveryPromo] = await Promise.all([
    prisma.zone.findMany({ where: { active: true }, orderBy: { idx: "asc" } }),
    prisma.promotion.findFirst({
      where: { kind: "free_delivery", active: true, auto: true },
      orderBy: { minSubtotalCents: "asc" },
      select: { minSubtotalCents: true },
    }),
  ]);
  return {
    zones: zoneRows.map(rowToZone),
    freeDeliveryThresholdCents: freeDeliveryPromo?.minSubtotalCents ?? null,
  };
}

/**
 * Formules actives, créneaux et plats compris.
 *
 * Les plats des créneaux sont chargés avec : la section d'accueil doit savoir
 * si une formule reste réellement commandable (`isFormulaOrderable`) et de
 * quels suppléments elle est assortie. Annoncer une formule puis la refuser au
 * moment de payer serait pire que de ne pas l'afficher.
 */
async function loadFormules(limit: number): Promise<Formula[]> {
  const rows = await prisma.formula.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
    take: limit,
    include: {
      slots: {
        orderBy: { position: "asc" },
        include: { choices: { orderBy: { position: "asc" }, include: { dish: true } } },
      },
    },
  });
  return rows.map(rowToFormula);
}

/**
 * Coordonnées et horaires, depuis les réglages plutôt que depuis le catalogue.
 * Un changement d'adresse ou d'horaire dans l'administration se répercute donc
 * sur la page « À propos » sans intervention.
 */
async function loadPractical(): Promise<PracticalInfo> {
  const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);

  const payments = [
    settings["order.acceptCash"] === "true" ? "Espèces" : null,
    settings["order.acceptCard"] === "true" ? "Carte bancaire" : null,
  ].filter((p): p is string => p !== null);

  return {
    address: formatAddress(settings) || info.address,
    phone: settings["restaurant.phone"] || info.phone,
    payments: payments.length ? payments : info.payments,
    partner: info.partner,
    hours: hours.map((h) => ({
      jour: WEEKDAY_LABEL[h.weekday],
      horaire: formatDayHours(h),
    })),
  };
}

/**
 * Charge, en une passe, ce dont les blocs présents ont réellement besoin.
 *
 * Une page sans bloc « zones » ne doit pas interroger la table des zones : le
 * chargement est piloté par les types de sections effectivement affichés, et
 * chaque lecture échoue isolément — une table indisponible vide son bloc, elle
 * n'emporte pas le reste de la page.
 */
export async function loadSectionContext(sections: PageSectionView[]): Promise<SectionContext> {
  const kinds = new Set<SectionKind>(sections.map((s) => s.kind));
  const ctx: SectionContext = { ...EMPTY_CONTEXT };

  const needed: Promise<void>[] = [];
  const guard = (task: Promise<void>, what: string) =>
    needed.push(
      task.catch((error) => {
        console.error(`[contenu] chargement « ${what} » échoué:`, error);
      }),
    );

  if (kinds.has("plats_populaires")) {
    const limit = Math.max(
      ...sections.filter((s) => s.kind === "plats_populaires").map((s) => s.content.limit),
    );
    guard(
      loadPopulaires(limit).then((rows) => {
        ctx.populaires = rows;
      }),
      "plats mis en avant",
    );
  }

  if (kinds.has("plat_du_jour")) {
    guard(
      loadDailySpecial().then((plat) => {
        ctx.platToday = plat;
      }),
      "plat du jour",
    );
  }

  if (kinds.has("zones")) {
    guard(
      loadZones().then((r) => {
        ctx.zones = r.zones;
        ctx.freeDeliveryThresholdCents = r.freeDeliveryThresholdCents;
      }),
      "zones de livraison",
    );
  }

  if (kinds.has("formules")) {
    const limit = Math.max(
      ...sections.filter((s) => s.kind === "formules").map((s) => s.content.limit),
    );
    guard(
      loadFormules(limit).then((rows) => {
        ctx.formules = rows;
      }),
      "formules",
    );
  }

  if (kinds.has("infos_pratiques")) {
    guard(
      loadPractical().then((p) => {
        ctx.practical = p;
      }),
      "informations pratiques",
    );
  }

  await Promise.all(needed);
  return ctx;
}

/** Sections visibles d'une page et données associées, prêtes à rendre. */
export async function loadPage(
  page: PageSlug,
): Promise<{ sections: PageSectionView[]; ctx: SectionContext }> {
  const sections = await loadSections(page);
  const ctx = await loadSectionContext(sections);
  return { sections, ctx };
}
