/* Contenu éditorial des pages vitrine.
 *
 * Les pages « Accueil » et « À propos » avaient leurs titres, leurs textes,
 * leurs photos et leurs prix écrits en dur dans les composants : corriger une
 * faute, ajouter un encart ou masquer une section demandait un développeur et
 * un déploiement. Chaque bloc est désormais une ligne `PageSection` en base,
 * et ce module en décrit le catalogue.
 *
 * Le pari est celui de sections **cadrées** plutôt que d'un éditeur libre : la
 * cliente choisit un type de bloc (cartes photo, atouts, tarifs, galerie…),
 * remplit ses champs, le réordonne ou le masque — mais la mise en page reste
 * celle de la maison. Impossible de casser le design en se trompant.
 *
 * Ce fichier est **pur** : aucun accès à la base, aucun composant. Il est donc
 * importable aussi bien par le rendu serveur que par l'écran d'administration
 * qui tourne dans le navigateur. Les lectures en base vivent dans
 * `lib/pageContent.ts`.
 */

import type { IconName } from "@/components/Icon";
import { photo } from "@/lib/menu";

// ─── Pages ────────────────────────────────────────────────────

export const PAGES = ["accueil", "a-propos"] as const;
export type PageSlug = (typeof PAGES)[number];

export const PAGE_LABEL: Record<PageSlug, string> = {
  accueil: "Accueil",
  "a-propos": "À propos",
};

/** Adresse publique d'une page, pour le lien « Voir la page » et la purge du cache. */
export const PAGE_PATH: Record<PageSlug, string> = {
  accueil: "/",
  "a-propos": "/a-propos",
};

export function isPageSlug(value: unknown): value is PageSlug {
  return typeof value === "string" && (PAGES as readonly string[]).includes(value);
}

// ─── Habillage ────────────────────────────────────────────────

/* Quatre fonds seulement, tous tirés de la charte. Laisser choisir une couleur
 * libre revenait à autoriser du texte gris clair sur fond beige : le contraste
 * de chaque combinaison est ici garanti. */
export const THEMES = ["clair", "gris", "sombre", "brique"] as const;
export type SectionTheme = (typeof THEMES)[number];

export const THEME_LABEL: Record<SectionTheme, string> = {
  clair: "Fond clair",
  gris: "Fond gris",
  sombre: "Fond sombre",
  brique: "Fond brique",
};

export const COLUMNS = [2, 3, 4, 5] as const;

// ─── Contenu ──────────────────────────────────────────────────

/**
 * Un élément de section : une carte, un atout, une étape, un tarif.
 *
 * Un seul type pour tous les blocs, dont chaque `kind` n'expose que les champs
 * qui le concernent (voir `KIND_META.itemFields`). Trois types d'éléments
 * quasi identiques auraient triplé le validateur et l'éditeur pour rien.
 */
export interface SectionItem {
  /** Clé stable — survit au réordonnancement, contrairement à un index. */
  id: string;
  title: string;
  text: string;
  photo: string | null;
  icon: IconName | null;
  href: string;
  /** Prix en centimes — jamais un flottant, voir `lib/money.ts`. */
  priceCents: number | null;
  /** Mention secondaire (« Sur le pouce », « Le plus demandé »). */
  badge: string;
}

export interface SectionContent {
  /** Ligne d'accroche en écriture manuscrite, au-dessus du titre. */
  eyebrow: string;
  /** Titre. Un passage entre astérisques passe en manuscrit doré. */
  title: string;
  subtitle: string;
  /** Texte long : une ligne vide sépare deux paragraphes. */
  body: string;
  theme: SectionTheme;
  columns: number;
  photos: string[];
  ctaLabel: string;
  ctaHref: string;
  altLabel: string;
  altHref: string;
  /** Texte à droite plutôt qu'à gauche. */
  reverse: boolean;
  /** Nombre d'éléments affichés par les blocs dynamiques. */
  limit: number;
  items: SectionItem[];
}

export const EMPTY_CONTENT: SectionContent = {
  eyebrow: "",
  title: "",
  subtitle: "",
  body: "",
  theme: "clair",
  columns: 3,
  photos: [],
  ctaLabel: "",
  ctaHref: "",
  altLabel: "",
  altHref: "",
  reverse: false,
  limit: 6,
  items: [],
};

export interface PageSectionView {
  id: string;
  page: PageSlug;
  kind: SectionKind;
  label: string;
  position: number;
  visible: boolean;
  content: SectionContent;
}

// ─── Catalogue des blocs ──────────────────────────────────────

export const SECTION_KINDS = [
  "hero",
  "entete",
  "cartes",
  "atouts",
  "etapes",
  "tarifs",
  "texte_images",
  "galerie",
  "appel_action",
  "plats_populaires",
  "plat_du_jour",
  "formules",
  "zones",
  "infos_pratiques",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export function isSectionKind(value: unknown): value is SectionKind {
  return typeof value === "string" && (SECTION_KINDS as readonly string[]).includes(value);
}

/** Champs de section proposés par l'éditeur, selon le type de bloc. */
export type SectionField =
  | "eyebrow"
  | "title"
  | "subtitle"
  | "body"
  | "theme"
  | "columns"
  | "photos"
  | "cta"
  | "alt"
  | "reverse"
  | "limit"
  | "items";

export type ItemField = keyof Omit<SectionItem, "id">;

export interface KindMeta {
  label: string;
  /** Ce que le bloc fait, en une phrase, pour l'écran d'administration. */
  hint: string;
  icon: IconName;
  fields: SectionField[];
  itemFields: ItemField[];
  /** Singulier du nom d'un élément (« carte », « atout »…). */
  itemLabel: string;
  /** Son article — « Ajouter **une** carte », « Ajouter **un** atout ». */
  itemArticle: "un" | "une";
  /**
   * Bloc alimenté par les données métier (plats, zones, horaires…). Son
   * contenu vient de la base ; seuls ses titres et son habillage se règlent
   * ici — sinon deux sources se contrediraient sur un prix.
   */
  dynamic: boolean;
  /** Bloc qui n'a de sens qu'une fois par page. */
  once: boolean;
}

export const KIND_META: Record<SectionKind, KindMeta> = {
  hero: {
    label: "Bandeau d'ouverture",
    hint: "Grande photo, accroche, deux boutons et le test de zone de livraison.",
    icon: "image",
    fields: ["eyebrow", "title", "body", "photos", "cta", "alt", "items"],
    itemFields: ["title", "icon"],
    itemLabel: "pastille",
    itemArticle: "une",
    dynamic: false,
    once: true,
  },
  entete: {
    label: "En-tête de page",
    hint: "Bandeau de titre centré, en haut d'une page.",
    icon: "list",
    fields: ["eyebrow", "title", "subtitle", "theme"],
    itemFields: [],
    itemLabel: "élément",
    itemArticle: "un",
    dynamic: false,
    once: true,
  },
  cartes: {
    label: "Cartes photo",
    hint: "Une grille de photos titrées et cliquables — les univers, les spécialités…",
    icon: "box",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns", "items"],
    itemFields: ["title", "text", "photo", "href"],
    itemLabel: "carte",
    itemArticle: "une",
    dynamic: false,
    once: false,
  },
  atouts: {
    label: "Atouts (icônes)",
    hint: "Des arguments courts, chacun avec son icône : produits frais, fait maison…",
    icon: "sparkle",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns", "items"],
    itemFields: ["title", "text", "icon"],
    itemLabel: "atout",
    itemArticle: "un",
    dynamic: false,
    once: false,
  },
  etapes: {
    label: "Étapes numérotées",
    hint: "Un déroulé en trois temps : composez, payez, on vous livre.",
    icon: "check",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns", "items"],
    itemFields: ["title", "text"],
    itemLabel: "étape",
    itemArticle: "une",
    dynamic: false,
    once: false,
  },
  tarifs: {
    label: "Cartes avec prix",
    hint: "Des offres avec un prix affiché en pastille. Les prix saisis ici sont indicatifs.",
    icon: "euro",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns", "items"],
    itemFields: ["title", "text", "priceCents", "badge"],
    itemLabel: "offre",
    itemArticle: "une",
    dynamic: false,
    once: false,
  },
  texte_images: {
    label: "Texte & photos",
    hint: "Un récit sur une colonne, une grille de photos sur l'autre, avec un bouton.",
    icon: "edit",
    fields: ["eyebrow", "title", "body", "photos", "theme", "cta", "alt", "reverse"],
    itemFields: [],
    itemLabel: "élément",
    itemArticle: "un",
    dynamic: false,
    once: false,
  },
  galerie: {
    label: "Galerie de photos",
    hint: "Uniquement des photos, en grille.",
    icon: "image",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns", "photos"],
    itemFields: [],
    itemLabel: "photo",
    itemArticle: "une",
    dynamic: false,
    once: false,
  },
  appel_action: {
    label: "Appel à l'action",
    hint: "Un bandeau pleine largeur avec un message fort et jusqu'à deux boutons.",
    icon: "megaphone",
    fields: ["eyebrow", "title", "body", "theme", "cta", "alt"],
    itemFields: [],
    itemLabel: "élément",
    itemArticle: "un",
    dynamic: false,
    once: false,
  },
  plats_populaires: {
    label: "Plats mis en avant",
    hint: "Les plats cochés « populaire » dans l'écran Plats. Titres et nombre réglables ici.",
    icon: "star",
    fields: ["eyebrow", "title", "subtitle", "theme", "limit", "cta"],
    itemFields: [],
    itemLabel: "plat",
    itemArticle: "un",
    dynamic: true,
    once: false,
  },
  plat_du_jour: {
    label: "Plat du jour",
    hint: "Le plat du jour programmé dans « Mise en avant ». Masqué s'il n'y en a pas.",
    icon: "flame",
    fields: ["eyebrow", "subtitle", "theme", "cta"],
    itemFields: [],
    itemLabel: "plat",
    itemArticle: "un",
    dynamic: true,
    once: true,
  },
  formules: {
    label: "Formules",
    hint: "Les formules et leurs prix, tels que définis en base. Rien à ressaisir ici.",
    icon: "tag",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns", "limit"],
    itemFields: [],
    itemLabel: "formule",
    itemArticle: "une",
    dynamic: true,
    once: false,
  },
  zones: {
    label: "Zones de livraison",
    hint: "Les secteurs livrés, leurs frais et leurs minimums, depuis l'écran Zones.",
    icon: "pin",
    fields: ["eyebrow", "title", "subtitle", "theme", "columns"],
    itemFields: [],
    itemLabel: "zone",
    itemArticle: "une",
    dynamic: true,
    once: true,
  },
  infos_pratiques: {
    label: "Informations & horaires",
    hint: "Adresse, téléphone, paiements et horaires, depuis Réglages. Toujours à jour.",
    icon: "clock",
    fields: ["title", "subtitle", "theme", "cta"],
    itemFields: [],
    itemLabel: "information",
    itemArticle: "une",
    dynamic: true,
    once: false,
  },
};

/** Ordre de proposition dans le menu « Ajouter une section ». */
export const KIND_GROUPS: { title: string; kinds: SectionKind[] }[] = [
  {
    title: "Texte & images",
    kinds: ["entete", "texte_images", "cartes", "atouts", "etapes", "galerie"],
  },
  { title: "Offres & appels à l'action", kinds: ["tarifs", "appel_action", "hero"] },
  {
    title: "Blocs reliés à la base",
    kinds: ["plats_populaires", "plat_du_jour", "formules", "zones", "infos_pratiques"],
  },
];

// ─── Validation ───────────────────────────────────────────────

/* Bornes hautes : l'écran d'administration ne les atteint jamais, elles
 * protègent la page d'un appel direct à l'API qui enverrait mille éléments. */
const MAX_ITEMS = 12;
const MAX_PHOTOS = 12;
const MAX_SHORT = 200;
const MAX_LONG = 4000;

/**
 * Sources d'images autorisées. La politique de sécurité du site
 * (`next.config.mjs`, directive `img-src`) ne charge que les photos locales et
 * celles téléversées sur Vercel Blob : accepter une URL quelconque afficherait
 * un cadre vide chez le visiteur, sans le moindre message d'erreur.
 */
export function isAllowedPhoto(src: string): boolean {
  return (
    /^\/[\w./-]+\.(jpe?g|png|webp|avif)$/i.test(src) ||
    /^https:\/\/[\w-]+\.public\.blob\.vercel-storage\.com\/[\w./%-]+$/i.test(src)
  );
}

/**
 * Liens autorisés : ancres de la page, chemins internes, http(s), téléphone et
 * courriel. Rejette notamment `javascript:` — un lien administrable est une
 * entrée de script si on ne le filtre pas.
 */
export function isAllowedHref(href: string): boolean {
  return (
    /^#[\w-]+$/.test(href) ||
    /^\/[\w./?#=&%-]*$/.test(href) ||
    /^(https?:\/\/|tel:|mailto:)[^\s<>"']+$/i.test(href)
  );
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeItem(raw: unknown, index: number): SectionItem {
  const o = (raw ?? {}) as Record<string, unknown>;
  const photoSrc = str(o.photo, MAX_SHORT).trim();
  const href = str(o.href, MAX_SHORT).trim();
  const icon = str(o.icon, 40).trim();
  const price = o.priceCents;

  return {
    id: str(o.id, 40).trim() || `i${index}`,
    title: str(o.title, MAX_SHORT).trim(),
    text: str(o.text, MAX_LONG).trim(),
    photo: photoSrc && isAllowedPhoto(photoSrc) ? photoSrc : null,
    icon: icon ? (icon as IconName) : null,
    href: href && isAllowedHref(href) ? href : "",
    priceCents:
      price === null || price === undefined || price === ""
        ? null
        : clampInt(price, 0, 100_000_00, 0),
    badge: str(o.badge, MAX_SHORT).trim(),
  };
}

/**
 * Rend exploitable n'importe quel JSON stocké : champs manquants complétés,
 * valeurs hors bornes ramenées, liens et photos filtrés. Une section corrompue
 * s'affiche vide plutôt que de faire tomber la page entière.
 */
export function normalizeContent(raw: unknown): SectionContent {
  const o = (raw ?? {}) as Record<string, unknown>;
  const theme = str(o.theme, 20) as SectionTheme;
  const ctaHref = str(o.ctaHref, MAX_SHORT).trim();
  const altHref = str(o.altHref, MAX_SHORT).trim();

  return {
    eyebrow: str(o.eyebrow, MAX_SHORT).trim(),
    title: str(o.title, MAX_SHORT).trim(),
    subtitle: str(o.subtitle, MAX_LONG).trim(),
    body: str(o.body, MAX_LONG),
    theme: THEMES.includes(theme) ? theme : "clair",
    columns: (COLUMNS as readonly number[]).includes(Number(o.columns)) ? Number(o.columns) : 3,
    photos: (Array.isArray(o.photos) ? o.photos : [])
      .slice(0, MAX_PHOTOS)
      .map((p) => str(p, MAX_SHORT).trim())
      .filter(isAllowedPhoto),
    ctaLabel: str(o.ctaLabel, MAX_SHORT).trim(),
    ctaHref: ctaHref && isAllowedHref(ctaHref) ? ctaHref : "",
    altLabel: str(o.altLabel, MAX_SHORT).trim(),
    altHref: altHref && isAllowedHref(altHref) ? altHref : "",
    reverse: o.reverse === true,
    limit: clampInt(o.limit, 1, 24, 6),
    items: (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).map(normalizeItem),
  };
}

/** Contenu d'une section fraîchement ajoutée : jamais un bloc vide et muet. */
export function starterContent(kind: SectionKind): SectionContent {
  const base = { ...EMPTY_CONTENT };
  const item = (n: number, extra: Partial<SectionItem> = {}): SectionItem => ({
    id: `i${n}`,
    title: `Titre ${n}`,
    text: "Quelques mots de description.",
    photo: null,
    icon: null,
    href: "",
    priceCents: null,
    badge: "",
    ...extra,
  });

  switch (kind) {
    case "hero":
      return {
        ...base,
        eyebrow: "Chez Laila · Cuisine du monde",
        title: "Le voyage *des saveurs* livré chez vous.",
        body: "Décrivez votre cuisine en une phrase.",
        photos: [photo(3), photo(11)],
        ctaLabel: "Voir la carte",
        ctaHref: "/carte",
        altLabel: "Découvrir nos univers",
        altHref: "#saveurs",
        items: [item(1, { title: "Livraison & à emporter", icon: "truck", text: "" })],
      };
    case "entete":
      return {
        ...base,
        theme: "sombre",
        eyebrow: "Chez Laila",
        title: "Titre de la page",
        subtitle: "Une phrase d'introduction.",
      };
    case "cartes":
      return {
        ...base,
        title: "Titre de la section",
        items: [1, 2, 3].map((n) => item(n, { href: "/carte" })),
      };
    case "atouts":
      return {
        ...base,
        theme: "gris",
        title: "Ce qui nous anime",
        items: [
          item(1, { title: "Produits frais", icon: "leaf" }),
          item(2, { title: "Fait maison", icon: "flame" }),
          item(3, { title: "Recettes de famille", icon: "heart" }),
        ],
      };
    case "etapes":
      return {
        ...base,
        title: "Comment ça marche",
        items: [1, 2, 3].map((n) => item(n)),
      };
    case "tarifs":
      return {
        ...base,
        theme: "gris",
        columns: 2,
        title: "Nos offres",
        items: [1, 2].map((n) => item(n, { priceCents: 1000, badge: "" })),
      };
    case "texte_images":
      return {
        ...base,
        title: "Notre histoire",
        body: "Premier paragraphe.\n\nSecond paragraphe.",
        photos: [photo(3), photo(11), photo(4), photo(12)],
        ctaLabel: "Découvrir la carte",
        ctaHref: "/carte",
      };
    case "galerie":
      return {
        ...base,
        title: "En images",
        columns: 4,
        photos: [photo(3), photo(11), photo(4), photo(12)],
      };
    case "appel_action":
      return {
        ...base,
        theme: "brique",
        title: "Une envie de voyage ?",
        body: "Commandez en quelques minutes.",
        ctaLabel: "Commander",
        ctaHref: "/carte",
      };
    case "plats_populaires":
      return { ...base, eyebrow: "Les chouchous", title: "Nos incontournables", limit: 6, ctaLabel: "Toute la carte", ctaHref: "/carte" };
    case "plat_du_jour":
      return { ...base, theme: "brique", eyebrow: "Plat du jour", subtitle: "Préparé en quantité limitée — uniquement aujourd'hui.", ctaLabel: "Commander", ctaHref: "/carte" };
    case "formules":
      return { ...base, theme: "gris", columns: 2, eyebrow: "Le bon plan", title: "Nos formules", limit: 6 };
    case "zones":
      return { ...base, columns: 4, eyebrow: "On vient jusqu'à vous", title: "Zones de livraison", subtitle: "Hors zone, l'à emporter reste possible." };
    case "infos_pratiques":
      return { ...base, title: "Informations", subtitle: "Horaires", ctaLabel: "Commander", ctaHref: "/carte" };
  }
}

// ─── Contenu par défaut des pages ─────────────────────────────

export interface SectionSeed {
  kind: SectionKind;
  label: string;
  content: SectionContent;
}

const seed = (kind: SectionKind, label: string, content: Partial<SectionContent>): SectionSeed => ({
  kind,
  label,
  content: { ...starterContent(kind), ...content },
});

const it = (
  id: string,
  title: string,
  text: string,
  extra: Partial<SectionItem> = {},
): SectionItem => ({
  id,
  title,
  text,
  photo: null,
  icon: null,
  href: "",
  priceCents: null,
  badge: "",
  ...extra,
});

/**
 * Le site tel qu'il était écrit en dur, transposé en sections.
 *
 * Sert deux fois : au premier passage dans le back-office, ces sections sont
 * écrites en base et deviennent modifiables ; et si la base est injoignable,
 * la page publique les affiche telles quelles plutôt qu'un écran blanc.
 */
export const DEFAULT_SECTIONS: Record<PageSlug, SectionSeed[]> = {
  accueil: [
    seed("hero", "Bandeau d'ouverture", {
      eyebrow: "Chez Laila · Cuisine du monde",
      title: "Le voyage *des saveurs*\nlivré chez vous.",
      body: "Tajines, tcheb, yassa, mafé, grillades & bowls frais — la cuisine du monde de Chez Laila, préparée maison à Pontault-Combault.",
      photos: [photo(3), photo(11)],
      ctaLabel: "Voir la carte",
      ctaHref: "/carte",
      altLabel: "Découvrir nos univers",
      altHref: "#saveurs",
      items: [
        it("badge1", "Livraison & à emporter", "", { icon: "truck" }),
        it("badge2", "Uber Eats", ""),
      ],
    }),
    seed("cartes", "Trio des saveurs", {
      eyebrow: "Trois continents",
      title: "Une assiette, le monde entier",
      columns: 3,
      items: [
        it(
          "africaine",
          "Afrique de l'Ouest",
          "Tcheb, yassa, mafé, athiéké — riz au gras et sauces mijotées.",
          { photo: photo(4), href: "/carte" },
        ),
        it(
          "maghreb",
          "Maghreb",
          "Tajines fondants : veau-pruneaux, poulet aux légumes, boulettes.",
          { photo: photo(11), href: "/carte" },
        ),
        it(
          "medit",
          "Méditerranée",
          "Chakchouka, zaalouk, sardines frites — des saveurs solaires.",
          { photo: photo(25), href: "/carte" },
        ),
      ],
    }),
    seed("plat_du_jour", "Plat du jour", {
      theme: "brique",
      eyebrow: "Plat du jour",
      subtitle: "Préparé en quantité limitée — uniquement aujourd'hui",
      ctaLabel: "Commander",
      ctaHref: "/carte",
    }),
    seed("plats_populaires", "Nos incontournables", {
      eyebrow: "Les chouchous",
      title: "Nos incontournables",
      limit: 6,
      ctaLabel: "Toute la carte",
      ctaHref: "/carte",
    }),
    seed("formules", "Nos formules", {
      theme: "gris",
      eyebrow: "Plus avantageux qu'à la carte",
      title: "Nos formules",
      subtitle:
        "Un plat au choix parmi nos salades & bowls, tajines, plats d'Afrique de l'Ouest, méditerranéens et grillades. Boisson : jus pressé ou cocktail maison.",
      columns: 5,
      limit: 6,
    }),
    seed("zones", "Zones de livraison", {
      eyebrow: "On vient jusqu'à vous",
      title: "Zones de livraison",
      subtitle: "Hors zone, l'à emporter reste possible.",
      columns: 4,
    }),
    seed("etapes", "Comment ça marche", {
      columns: 3,
      items: [
        it("e1", "Composez", "Parcourez la carte et personnalisez vos plats."),
        it(
          "e2",
          "Payez en ligne",
          "Carte bancaire, Apple Pay, Google Pay ou PayPal — ou en espèces à la livraison.",
        ),
        it("e3", "On vous livre", "Suivi de votre commande en temps réel jusqu'à votre porte."),
      ],
    }),
    seed("texte_images", "Teaser « Notre histoire »", {
      theme: "sombre",
      eyebrow: "Chez Laila",
      title: "Une cuisine généreuse, faite maison",
      body: "Ô 3 Saveurs réunit trois cultures dans une même assiette : l'Afrique de l'Ouest, le Maghreb et la Méditerranée. Des recettes familiales, des produits frais, et beaucoup d'amour — à déguster chez vous.",
      photos: [photo(3), photo(11), photo(4), photo(12)],
      ctaLabel: "Notre histoire",
      ctaHref: "/a-propos",
      altLabel: "Nous appeler",
      altHref: "/contact",
    }),
  ],

  "a-propos": [
    seed("entete", "En-tête", {
      theme: "sombre",
      eyebrow: "Chez Laila",
      title: "Notre histoire",
      subtitle: "Trois continents, une seule cuisine, faite maison chaque jour à Pontault-Combault.",
    }),
    seed("texte_images", "Le récit", {
      body: "**Ô 3 Saveurs — Chez Laila** est née d'une envie simple : réunir dans une même assiette les saveurs qui ont bercé notre famille. Trois continents, une seule cuisine, faite maison chaque jour.\n\nDe l'**Afrique de l'Ouest** (thiéboudiène, yassa, mafé), du **Maghreb** (nos tajines mijotés) et de la **Méditerranée** (chakchouka, zaalouk, sardines), chaque plat raconte un voyage.\n\nNous travaillons des produits frais, des épices choisies et des recettes transmises de génération en génération. Le tout livré chez vous ou à emporter, sans rien perdre de la générosité de la maison.",
      photos: [photo(3), photo(11), photo(4), photo(12)],
      ctaLabel: "Découvrir la carte",
      ctaHref: "/carte",
    }),
    seed("atouts", "Ce qui nous anime", {
      theme: "gris",
      eyebrow: "Ce qui nous anime",
      title: "Une cuisine généreuse",
      columns: 3,
      items: [
        it(
          "frais",
          "Produits frais",
          "Légumes, viandes et épices choisis chaque semaine, jamais de surgelé industriel.",
          { icon: "leaf" },
        ),
        it(
          "maison",
          "Fait maison",
          "Sauces, marinades et bouillons mijotent sur place, du premier au dernier service.",
          { icon: "flame" },
        ),
        it(
          "famille",
          "Recettes de famille",
          "Transmises de génération en génération, sans raccourci ni recette standardisée.",
          { icon: "heart" },
        ),
      ],
    }),
    seed("infos_pratiques", "Informations & horaires", {
      title: "Informations",
      subtitle: "Horaires",
      ctaLabel: "Commander",
      ctaHref: "/carte",
    }),
  ],
};

// ─── Aides de rendu ───────────────────────────────────────────

/** Découpe un texte long en paragraphes (une ligne vide = un nouveau bloc). */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Découpe un titre en fragments, en marquant ceux entourés d'astérisques.
 * `Le voyage *des saveurs* livré` → trois fragments, le second en manuscrit.
 * C'est la seule mise en forme confiée à la saisie : elle ne peut produire
 * qu'un changement de police, jamais du balisage.
 */
export function accents(text: string): { text: string; accent: boolean }[] {
  return text
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("*") && part.endsWith("*") && part.length > 2
        ? { text: part.slice(1, -1), accent: true }
        : { text: part, accent: false },
    );
}

/** Même principe pour un texte courant : `**gras**` met en valeur un passage. */
export function strongs(text: string): { text: string; strong: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? { text: part.slice(2, -2), strong: true }
        : { text: part, strong: false },
    );
}
