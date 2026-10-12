/* Référencement : métadonnées, données structurées et lisibilité machine.
 *
 * Ce module est la **source unique** de tout ce qu'un moteur — de recherche ou
 * génératif — lit du restaurant. Le principe est celui du reste du projet :
 * une donnée, une origine. L'adresse, le téléphone, les horaires et les zones
 * livrées viennent des réglages en base, pas d'un JSON-LD recopié à la main.
 * Un JSON-LD écrit en dur finit toujours par contredire le site le jour où la
 * cliente change un horaire au back-office — et une incohérence entre le
 * balisage et la page visible est exactement ce que Google sanctionne.
 *
 * Deux publics, un seul balisage :
 *
 * · **SEO local** — Google lit le nœud `Restaurant` pour le panneau de droite,
 *   les horaires « ouvert / fermé » et le rattachement à Pontault-Combault.
 * · **GEO** (moteurs génératifs — ChatGPT, Perplexity, Google AI Overviews) —
 *   ces moteurs citent ce qu'ils peuvent extraire sans ambiguïté. Un prix, une
 *   zone de livraison et un horaire en JSON-LD sont repris tels quels ; les
 *   mêmes informations noyées dans une mise en page ne le sont pas.
 *
 * Les fonctions de ce fichier sont **pures** : elles prennent les données et
 * rendent un objet. Les lectures en base vivent dans `lib/seoData.ts`, ce qui
 * garde celui-ci testable sans Prisma.
 */

import type { Metadata } from "next";

import type { DayHours } from "@/lib/hours";
import type { Category, Dish, Formula, Zone } from "@/lib/menu";

/* ─── Identité du site ──────────────────────────────────────── */

/** URL publique, sans barre oblique finale. */
export const SITE_URL = (process.env.NEXTAUTH_URL ?? "https://o3saveurs.fr")
  .trim()
  .replace(/\/+$/, "");

/** URL absolue à partir d'un chemin interne — exigée par tout le balisage. */
export function abs(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Identifiants stables des nœuds, pour que le graphe se recoupe. */
export const NODE = {
  restaurant: `${SITE_URL}/#restaurant`,
  website: `${SITE_URL}/#website`,
  menu: `${SITE_URL}/carte#menu`,
} as const;

/**
 * Pages publiques indexables, dans l'ordre d'importance.
 *
 * Sert à la fois au plan du site et aux fils d'Ariane : ajouter une page ici
 * suffit à la faire entrer dans les deux. Les pages porteuses de données
 * personnelles (`/compte`, `/facture`, `/commande`, `/admin`, `/livreur`,
 * `/tournee`) n'y figurent pas — elles sont par ailleurs en `noindex` via
 * `next.config.mjs` et `app/robots.ts`.
 *
 * `revised` est la date de dernière révision **du contenu** de la page, tenue
 * à la main. Elle ne sert qu'aux pages que la base ne sait pas dater : la
 * Carte et les Formules ont leurs plats et leurs formules horodatés en base,
 * les pages à sections aussi, mais Traiteur, Contact, Allergènes et les trois
 * pages légales sont écrites dans le dépôt — elles sortaient donc du plan du
 * site sans aucune date, et Google n'avait aucun signal pour y revenir.
 *
 * Écrite ici plutôt que déduite de la compilation, et c'est délibéré : une
 * date de build remonterait à chaque déploiement, y compris pour un correctif
 * CSS, et dirait aux robots que tout le site change en permanence — un signal
 * qu'ils finissent par ignorer. On la remonte quand la page change pour de
 * bon, pas quand le dépôt bouge.
 */
export const PUBLIC_ROUTES = [
  { path: "/", label: "Accueil", priority: 1, changeFrequency: "weekly", revised: "2026-08-25" },
  { path: "/carte", label: "La Carte", priority: 0.9, changeFrequency: "weekly", revised: "2026-10-13" },
  { path: "/formules", label: "Nos Formules", priority: 0.8, changeFrequency: "weekly", revised: "2026-10-13" },
  { path: "/traiteur", label: "Traiteur", priority: 0.7, changeFrequency: "monthly", revised: "2026-10-13" },
  { path: "/a-propos", label: "À propos", priority: 0.5, changeFrequency: "monthly", revised: "2026-10-13" },
  { path: "/contact", label: "Contact", priority: 0.6, changeFrequency: "monthly", revised: "2026-10-13" },
  { path: "/allergenes", label: "Allergènes", priority: 0.4, changeFrequency: "monthly", revised: "2026-10-13" },
  /* `/commander` n'y figure pas : le tunnel de commande est en `noindex` (voir
   * `app/commander/page.tsx`), et un plan du site qui déclare une page
   * interdite d'index est une contradiction que Search Console signale. */
  { path: "/mentions-legales", label: "Mentions légales", priority: 0.1, changeFrequency: "yearly", revised: "2026-10-13" },
  { path: "/cgv", label: "CGV", priority: 0.1, changeFrequency: "yearly", revised: "2026-10-13" },
  { path: "/confidentialite", label: "Confidentialité", priority: 0.1, changeFrequency: "yearly", revised: "2026-10-13" },
] as const satisfies readonly {
  path: string;
  label: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
  /** Date ISO `AAAA-MM-JJ`, jamais un horodatage de compilation. */
  revised: string;
}[];

/**
 * Préfixes interdits aux robots.
 *
 * Doublon volontaire de l'en-tête `X-Robots-Tag` de `next.config.mjs` : l'un
 * empêche l'indexation d'une page déjà explorée, l'autre évite l'exploration.
 * Les deux sont nécessaires — un `noindex` que le robot n'a pas le droit de
 * lire ne sert à rien, et une URL personnelle explorée reste une fuite même
 * non indexée.
 */
export const DISALLOWED_PATHS = [
  "/admin",
  "/api",
  "/compte",
  "/commande",
  "/facture",
  "/livreur",
  "/tournee",
] as const;

/* ─── Métadonnées des pages publiques ───────────────────────── */

/**
 * Nom de marque tel qu'il s'affiche dans un onglet et un aperçu de partage.
 *
 * Écrit ici et non lu en réglages, contrairement à tout le reste du module :
 * `export const metadata` est évalué sans `await`, une page ne peut donc pas
 * attendre la base pour composer son titre. C'est déjà le choix du layout
 * racine, qui porte le même gabarit — cette constante le rend commun au lieu
 * de le laisser recopié dans neuf fichiers.
 */
export const BRAND = "Ô 3 Saveurs — Chez Laila";

/** Visuel repris par Facebook, WhatsApp, iMessage et Slack à chaque partage. */
export interface PageShare {
  /** Chemin réel sous `public/` — une image absente donne un aperçu vide. */
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Visuel de repli des pages légales.
 *
 * Elles n'ont pas de photo à elles et n'en demandent pas : on n'illustre pas
 * des CGV avec un plat, cela ne dit rien de leur contenu. La table dressée du
 * site — celle que le layout racine sert déjà par défaut — fait au moins
 * reconnaître le restaurant quand le lien circule.
 */
const SHARE_DEFAUT = {
  url: "/photos/p03.jpg",
  width: 1600,
  height: 1066,
  alt: "Table dressée de plats et de cocktails maison du restaurant Ô 3 Saveurs",
} as const satisfies PageShare;

export interface PageMeta {
  /**
   * 150 à 160 caractères.
   *
   * Au-delà, Google coupe la phrase en plein milieu ; en deçà, on laisse de la
   * place payée et non utilisée. Ce n'est pas un endroit où empiler des
   * mots-clés : c'est la seule phrase que le client lit avant de décider de
   * cliquer, elle doit lui dire ce qu'il va trouver.
   */
  description: string;
  share: PageShare;
}

/**
 * Ce que chaque page publique annonce aux moteurs et aux messageries.
 *
 * Rassemblé ici plutôt que dans les neuf `page.tsx` pour une raison simple :
 * c'est la seule façon de **vérifier** ces textes. Une description trop longue
 * ou une image absente ne casse rien, ne lève aucune erreur et ne se voit que
 * dans un résultat de recherche tronqué ou un aperçu WhatsApp gris. Les tests
 * de `tests/seo.test.ts` comptent les caractères et ouvrent chaque fichier.
 *
 * Les visuels sont les photos déjà livrées avec le dépôt : le restaurant n'a
 * pas de visuel de partage dédié, et une photo de plat réelle vaut mieux
 * qu'une carte générée. Chacune est choisie pour ce que la page raconte, pas
 * au hasard — une page partagée sans rapport avec son image se fait fermer.
 *
 * L'accueil n'y figure pas : sa description est celle du layout racine, qui
 * sert aussi de repli à toute page qui n'en déclare pas.
 */
export const PAGE_META = {
  "/carte": {
    description:
      "Tajines, couscous, thiéboudiène, mafé, yassa, grillades et desserts maison : toute la carte d'Ô 3 Saveurs à Pontault-Combault, en livraison ou à emporter.",
    share: {
      // La table entière : c'est la seule photo qui montre l'étendue de la carte.
      url: "/photos/Couverture-Hero.jpg",
      width: 1800,
      height: 1199,
      alt: "Table dressée de plats Ô 3 Saveurs : tajine, thiéboudiène, brochettes, yassa et cocktails maison",
    },
  },
  "/formules": {
    description:
      "Un plat au choix et une boisson maison à prix fixe : nos formules Express, Midi, Gourmande, Sandwich et Menu Enfant, midi et soir à Pontault-Combault.",
    share: {
      // Une assiette complète, telle qu'elle arrive quand on prend une formule.
      url: "/photos/p24.jpg",
      width: 1600,
      height: 1066,
      alt: "Assiette de riz rouge, légumes mijotés et bœuf, servie en formule",
    },
  },
  "/traiteur": {
    description:
      "Buffets, plateaux repas et réceptions à Pontault-Combault et en Seine-et-Marne : cuisine africaine et maghrébine préparée maison, devis gratuit sous 24 h.",
    share: {
      // Le grand plat à partager : c'est ce qu'on commande pour une réception,
      // et c'est ce qui distingue la page d'une simple photo d'assiette.
      url: "/photos/couscous-royal.jpg",
      width: 1400,
      height: 933,
      alt: "Grand plat de couscous royal garni de légumes, poulet, bœuf et merguez, prêt à partager",
    },
  },
  "/a-propos": {
    description:
      "Depuis Pontault-Combault, Laila cuisine maison l'Afrique de l'Ouest, le Maghreb et la Méditerranée. L'histoire, les valeurs et les horaires d'Ô 3 Saveurs.",
    share: {
      // Le mafé : le plat de famille par lequel la maison se raconte.
      url: "/photos/p01.jpg",
      width: 1600,
      height: 1066,
      alt: "Mafé de bœuf à la sauce d'arachide, servi sur son riz blanc dans un bol en grès bleu",
    },
  },
  "/contact": {
    description:
      "Ô 3 Saveurs — Chez Laila, 38 rue des Prés Saint-Martin à Pontault-Combault : téléphone, horaires d'ouverture, plan d'accès et formulaire pour nous écrire.",
    share: {
      // Faute de photo de la devanture, la table dressée : une invitation à
      // venir, qui vaut mieux qu'un plat isolé sur une page de coordonnées.
      url: "/photos/p03.jpg",
      width: 1600,
      height: 1066,
      alt: "Table dressée de plats et de cocktails maison du restaurant Ô 3 Saveurs à Pontault-Combault",
    },
  },
  "/allergenes": {
    description:
      "Les 14 allergènes réglementaires, plat par plat, chez Ô 3 Saveurs à Pontault-Combault. Un doute avant de commander ? Tout est affiché, règlement UE 1169/2011.",
    share: {
      // Amandes et œuf à l'image : deux des quatorze, visibles dans l'assiette.
      url: "/photos/p11.jpg",
      width: 1600,
      height: 1092,
      alt: "Tajine de veau aux pruneaux, amandes et œuf, servi dans son plat en terre",
    },
  },
  "/mentions-legales": {
    description:
      "Éditeur du site, identité et coordonnées de l'entreprise, hébergeur et responsable de la publication : les mentions légales d'Ô 3 Saveurs à Pontault-Combault.",
    share: SHARE_DEFAUT,
  },
  "/cgv": {
    description:
      "Commande, prix, livraison, paiement, réclamations et droit de rétractation : les conditions générales de vente d'Ô 3 Saveurs, à lire avant de commander.",
    share: SHARE_DEFAUT,
  },
  "/confidentialite": {
    description:
      "Quelles données Ô 3 Saveurs collecte, pourquoi, combien de temps elles sont conservées et comment exercer vos droits. Aucun traceur publicitaire sur ce site.",
    share: SHARE_DEFAUT,
  },
} as const satisfies Record<string, PageMeta>;

/** Chemins dont ce module porte les métadonnées. */
export type PagePath = keyof typeof PAGE_META;

/**
 * Métadonnées complètes d'une page publique.
 *
 * Deux pièges du dépôt tiennent dans cette fonction, et c'est sa raison d'être.
 *
 * · **`openGraph` n'est pas fusionné, il est remplacé.** Next ne complète pas
 *   l'objet du layout racine : une page qui déclare son propre `openGraph`
 *   perd d'un coup l'image, le `siteName` et la locale. C'est ce qui faisait
 *   sortir la Carte, les Formules, le Traiteur, À propos, Contact et les
 *   Allergènes sans aucun visuel sur WhatsApp et Facebook, alors que le layout
 *   en déclarait un.
 *
 * · **Le canonical se déclare page par page.** Le layout ne doit jamais en
 *   porter (voir le commentaire de `app/layout.tsx`) : toute page sans
 *   `alternates` propre hériterait de celui de l'accueil et se déclarerait
 *   elle-même comme une copie à ne pas indexer. Le passage obligé par cette
 *   fonction rend l'oubli impossible.
 */
export function pageMetadata(input: {
  path: PagePath;
  /** Titre court — le layout racine y ajoute « · Ô 3 Saveurs — Chez Laila ». */
  title: string;
  /**
   * Accroche de l'aperçu de partage, quand la description meta — écrite pour
   * une page de résultats — est trop longue pour une vignette. À défaut, c'est
   * la description qui sert : deux textes valent mieux qu'un texte coupé.
   */
  accroche?: string;
}): Metadata {
  const { description, share } = PAGE_META[input.path];
  const titre = `${input.title} · ${BRAND}`;
  const accroche = input.accroche ?? description;

  return {
    title: input.title,
    description,
    alternates: { canonical: input.path },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: BRAND,
      title: titre,
      description: accroche,
      url: input.path,
      images: [share],
    },
    twitter: {
      card: "summary_large_image",
      title: titre,
      description: accroche,
      images: [share.url],
    },
  };
}

/* ─── Coordonnées du restaurant ─────────────────────────────── */

/** Ce dont le balisage a besoin, indépendamment de la forme des réglages. */
export interface BusinessProfile {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  /** Latitude/longitude si le géocodage a déjà tourné, sinon null. */
  lat: number | null;
  lng: number | null;
  /** Comptes sociaux renseignés (les vides sont écartés en amont). */
  socials: string[];
}

/**
 * Téléphone au format E.164, seul format que schema.org exploite sans
 * ambiguïté. « 01 72 84 52 44 » → « +33172845244 ».
 */
export function toE164(phone: string): string {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  return digits;
}

/* ─── Écritures de la marque ────────────────────────────────── */

/** Retire les diacritiques : « Ô 3 Saveurs » → « O 3 Saveurs ». */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Colle la lettre au chiffre : « Ô 3 Saveurs » → « Ô3 Saveurs ». */
function glue(s: string): string {
  return s.replace(/([A-Za-zÀ-ÿ])\s+(\d)/g, "$1$2");
}

/**
 * Toutes les façons dont le nom du restaurant s'écrit réellement.
 *
 * Le site écrit partout « Ô 3 Saveurs » — accent circonflexe, espace avant le
 * chiffre. Personne ne tape cela : on cherche « o3 saveurs », « o3saveurs »,
 * « chez laila ». Google replie bien les accents, mais « Ô 3 » et « o3 » ne se
 * découpent pas en les mêmes mots, et rien sur le site ne dit que les deux
 * désignent le même restaurant. `alternateName` le dit — c'est la façon
 * prévue par schema.org de rattacher plusieurs graphies à une seule entité.
 *
 * Les variantes sont **dérivées** du nom, pas listées à la main : le jour où
 * la cliente change le nom en réglages, la liste suit. Et elle reste courte —
 * ce sont des orthographes de la même marque, pas des mots-clés empilés.
 */
/** Nom d'hôte du site, s'il est publiable — « o3saveurs.fr », jamais « localhost ». */
function publicHost(): string {
  const host = (SITE_URL.split("//").pop() ?? "").toLowerCase();
  const bare = host.startsWith("www.") ? host.slice(4) : host;
  // Un domaine public porte un point et jamais de numéro de port.
  return bare.includes(".") && !bare.includes(":") ? bare : "";
}

export function brandAliases(profile: BusinessProfile): string[] {
  const { name, tagline } = profile;
  const full = tagline ? `${name} ${tagline}` : name;
  const spellings = [name, full].flatMap((s) => [s, deaccent(s), glue(s), glue(deaccent(s))]);

  const aliases = [
    ...spellings,
    // Forme collée sans espace du tout : « O3Saveurs », telle qu'on la tape
    // dans une barre d'adresse.
    glue(deaccent(name)).replace(/\s+/g, ""),
    tagline,
    // Le nom de domaine est lui-même une graphie de la marque, et c'est celle
    // qu'on recopie depuis un ticket de caisse ou un flyer. Écarté s'il n'a
    // pas l'allure d'un domaine public : en développement, `SITE_URL` vaut
    // « localhost:3000 », et personne ne cherche un restaurant sous ce nom.
    publicHost(),
  ];

  return [...new Set(aliases.map((s) => s.trim()).filter(Boolean))];
}

/* ─── Horaires ──────────────────────────────────────────────── */

const SCHEMA_WEEKDAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

interface OpeningHoursSpec {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
}

/**
 * Horaires internes → `OpeningHoursSpecification`.
 *
 * Un service par entrée : midi et soir sont deux plages distinctes, et les
 * fusionner ferait dire au balisage que le restaurant est ouvert à 16 h. Les
 * jours fermés le midi (vendredi, dimanche) n'ont donc qu'une entrée, et un
 * jour entièrement fermé n'en a aucune — c'est ainsi que Google déduit
 * « fermé » plutôt que « horaires inconnus ».
 */
export function openingHoursSpecification(hours: DayHours[]): OpeningHoursSpec[] {
  const out: OpeningHoursSpec[] = [];
  for (const day of hours) {
    if (day.closed) continue;
    const dayOfWeek = `https://schema.org/${SCHEMA_WEEKDAY[day.weekday] ?? "Monday"}`;
    if (day.lunchOpen && day.lunchClose) {
      out.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek,
        opens: day.lunchOpen,
        closes: day.lunchClose,
      });
    }
    if (day.dinnerOpen && day.dinnerClose) {
      out.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek,
        opens: day.dinnerOpen,
        closes: day.dinnerClose,
      });
    }
  }
  return out;
}

/* ─── Fourchette de prix ────────────────────────────────────── */

/**
 * Familles exclues du calcul de la fourchette de prix.
 *
 * `priceRange` répond à « combien coûte un repas ici ? ». Une sauce à 1 € ou
 * un piment à 0,50 € y répondent « rien », et le balisage annonçait de fait
 * « 0–18 € » — un chiffre qui n'a jamais correspondu à un repas. Les
 * accompagnements et les boissons sont des à-côtés : ils sortent du calcul,
 * pas de la carte.
 */
const PRICE_RANGE_EXCLUDED_CATS = ["accompagnements", "boissons", "canettes"] as const;

/**
 * Fourchette réelle d'un repas, en euros entiers — « 8–18 € ».
 *
 * Calculée sur le catalogue plutôt que figée : la carte bouge, et un
 * `priceRange` obsolète est une contradiction de plus entre le balisage et la
 * page. Les plats sans prix (« Bientôt ») sont ignorés.
 *
 * Deux familles en sortent, pour deux raisons différentes.
 *
 * · **Ce qui n'est pas un plat** — une sauce à 1 €, une canette à 2 €. Elles
 *   répondent « rien » à la question posée, et tiraient le plancher à zéro.
 *
 * · **Ce qui n'est pas un repas du jour** — l'agneau entier à 420 €, le
 *   demi-agneau à 220 €, la paella pour la tablée. Ces pièces se réservent
 *   48 à 72 h à l'avance pour une réception ; les compter revenait à annoncer
 *   « 2–420 € », un chiffre qu'aucun client n'a jamais payé pour dîner et que
 *   Google affichait tel quel dans son panneau.
 *
 * Le second filtre porte sur le **délai**, pas sur la catégorie. La liste de
 * catégories ci-dessus a précisément montré sa faiblesse : « Sur commande »
 * est née après elle et personne n'a pensé à l'y ajouter. `leadTimeHours`
 * décrit la chose elle-même — une pièce qui demande deux jours de préparation
 * n'est pas ce qu'on mange ce soir — et vaudra donc pour la prochaine famille
 * de ce genre sans qu'on ait à y revenir.
 */
export function priceRange(dishes: Dish[]): string {
  const prices = dishes
    .filter((d) => !(PRICE_RANGE_EXCLUDED_CATS as readonly string[]).includes(d.cat))
    .filter((d) => !d.leadTimeHours)
    .map((d) => d.priceCents)
    .filter((c): c is number => typeof c === "number" && c > 0);
  if (prices.length === 0) return "€€";
  /* Plancher à 1 € : un arrondi vers le bas peut toujours produire « 0 », ce
     qui se lit comme une erreur d'affichage plutôt que comme un prix. */
  const min = Math.max(1, Math.floor(Math.min(...prices) / 100));
  const max = Math.ceil(Math.max(...prices) / 100);
  return min === max ? `${min} €` : `${min}–${max} €`;
}

/* ─── Nœuds du graphe ───────────────────────────────────────── */

type JsonLdNode = Record<string, unknown>;

/**
 * Le nœud `Restaurant` — la pièce maîtresse du référencement local.
 *
 * `Restaurant` plutôt que `LocalBusiness` : c'est le sous-type exact, il hérite
 * de tout `LocalBusiness` et débloque en plus `servesCuisine`, `hasMenu` et
 * `acceptsReservations`. `areaServed` liste les communes réellement livrées
 * (barème de livraison), ce qui rattache le site aux recherches
 * « livraison <commune> » sans créer une page fantôme par ville.
 */
export function restaurantNode(input: {
  profile: BusinessProfile;
  hours: DayHours[];
  zones: Zone[];
  dishes: Dish[];
  acceptsCash: boolean;
  acceptsCard: boolean;
}): JsonLdNode {
  const { profile, hours, zones, dishes, acceptsCash, acceptsCard } = input;

  const cities = [...new Set(zones.flatMap((z) => z.villes))];
  const payments = [
    ...(acceptsCard ? ["Carte bancaire"] : []),
    ...(acceptsCash ? ["Espèces"] : []),
    "Titres-restaurant",
  ];

  const node: JsonLdNode = {
    "@type": "Restaurant",
    "@id": NODE.restaurant,
    name: `${profile.name} — ${profile.tagline}`,
    alternateName: brandAliases(profile),
    description:
      `Restaurant de cuisine du monde à ${profile.city} : spécialités d'Afrique de l'Ouest, ` +
      "du Maghreb et de Méditerranée, préparées maison. Livraison et vente à emporter.",
    url: SITE_URL,
    telephone: toE164(profile.phone),
    email: profile.email,
    image: [
      abs("/photos/Couverture-Hero.jpg"),
      abs("/photos/p04.jpg"),
      abs("/photos/p11.jpg"),
    ],
    /* `logo` et `image` ne jouent pas le même rôle et Google ne les
     * interchange pas : `image` sont les photos du lieu, `logo` est la marque
     * elle-même — c'est cette vignette qui s'affiche dans le panneau de droite
     * et à côté du lien dans les résultats mobiles. Une table dressée n'y a
     * jamais sa place. `/apple-icon` est l'emblème rendu en PNG 180×180 par
     * `app/apple-icon.tsx` : une seule source pour l'icône d'onglet, celle du
     * téléphone et celle du panneau de marque. */
    logo: abs("/apple-icon"),
    address: {
      "@type": "PostalAddress",
      streetAddress: profile.street,
      postalCode: profile.zip,
      addressLocality: profile.city,
      addressRegion: "Île-de-France",
      addressCountry: "FR",
    },
    servesCuisine: ["Africaine", "Ouest-africaine", "Maghrébine", "Méditerranéenne", "Halal"],
    priceRange: priceRange(dishes),
    currenciesAccepted: "EUR",
    paymentAccepted: payments.join(", "),
    openingHoursSpecification: openingHoursSpecification(hours),
    hasMenu: NODE.menu,
    acceptsReservations: false,
    /* Le restaurant livre et fait de la vente à emporter, mais ne sert pas en
     * salle : le dire explicitement évite que Google propose une réservation
     * de table qui n'existe pas. */
    hasDeliveryMethod: [
      "https://schema.org/OnSitePickup",
      "https://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
    ],
  };

  if (cities.length > 0) {
    node.areaServed = cities.map((city) => ({
      "@type": "City",
      name: city,
      address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "FR" },
    }));
  }

  if (profile.lat !== null && profile.lng !== null) {
    node.geo = { "@type": "GeoCoordinates", latitude: profile.lat, longitude: profile.lng };
  }

  if (profile.socials.length > 0) node.sameAs = profile.socials;

  /* Ce que le visiteur peut *faire* — repris par les assistants pour proposer
   * l'action « commander » plutôt qu'un simple lien. */
  node.potentialAction = {
    "@type": "OrderAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: abs("/carte"),
      actionPlatform: [
        "https://schema.org/DesktopWebPlatform",
        "https://schema.org/MobileWebPlatform",
      ],
    },
    deliveryMethod: ["https://schema.org/OnSitePickup"],
  };

  return node;
}

/** Nœud `WebSite` — rattache les pages au site et nomme la marque. */
export function websiteNode(profile: BusinessProfile): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": NODE.website,
    url: SITE_URL,
    name: `${profile.name} — ${profile.tagline}`,
    inLanguage: "fr-FR",
    alternateName: brandAliases(profile),
    publisher: { "@id": NODE.restaurant },
  };
}

/**
 * La carte complète en `Menu` / `MenuSection` / `MenuItem`.
 *
 * C'est le balisage qui fait citer un plat et son prix par un moteur
 * génératif. Les plats indisponibles ou sans prix sont écartés : annoncer un
 * plat qu'on ne peut pas commander est pire que de ne pas l'annoncer.
 */
export function menuNode(dishes: Dish[], categories: Category[]): JsonLdNode {
  const sections = categories
    .map((cat) => {
      const items = dishes
        .filter((d) => d.cat === cat.id && d.available && d.priceCents !== null)
        .map((dish) => {
          const item: JsonLdNode = {
            "@type": "MenuItem",
            name: dish.name,
            offers: {
              "@type": "Offer",
              price: ((dish.priceCents as number) / 100).toFixed(2),
              priceCurrency: "EUR",
              availability: "https://schema.org/InStock",
            },
          };
          if (dish.desc) item.description = dish.desc;
          if (dish.photo) {
            item.image = dish.photo.startsWith("http") ? dish.photo : abs(dish.photo);
          }
          /* `suitableForDiet` n'accepte que le vocabulaire schema.org : on ne
           * mappe que ce qui existe, le reste des tags reste hors balisage. */
          const diets: string[] = [];
          const tags = dish.tags.map((t) => t.toLowerCase());
          if (tags.some((t) => t.includes("végétarien") || t.includes("vegetarien"))) {
            diets.push("https://schema.org/VegetarianDiet");
          }
          if (tags.some((t) => t.includes("végan") || t.includes("vegan"))) {
            diets.push("https://schema.org/VeganDiet");
          }
          if (tags.some((t) => t.includes("halal"))) {
            diets.push("https://schema.org/HalalDiet");
          }
          if (diets.length > 0) item.suitableForDiet = diets;
          return item;
        });

      if (items.length === 0) return null;
      return { "@type": "MenuSection", name: cat.label, hasMenuItem: items };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return {
    "@type": "Menu",
    "@id": NODE.menu,
    name: "La carte — Ô 3 Saveurs",
    inLanguage: "fr-FR",
    hasMenuSection: sections,
  };
}

/** Les formules en offres à prix fixe. */
export function formulasNode(formulas: Formula[]): JsonLdNode {
  return {
    "@type": "ItemList",
    name: "Formules — Ô 3 Saveurs",
    itemListElement: formulas.map((f, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "MenuItem",
        name: f.name,
        description: f.desc || f.extra || undefined,
        offers: {
          "@type": "Offer",
          price: (f.priceCents / 100).toFixed(2),
          priceCurrency: "EUR",
          availability: "https://schema.org/InStock",
          url: abs("/formules"),
        },
      },
    })),
  };
}

/**
 * Le service traiteur en nœud `Service`.
 *
 * `/traiteur` était la seule page vitrine sans le moindre balisage : elle ne
 * portait qu'un titre et une description. Or c'est la page qui répond à une
 * requête à forte intention — « traiteur mariage Seine-et-Marne », « plateaux
 * repas entreprise Pontault-Combault » — et un `Service` rattaché au nœud
 * `Restaurant` par `provider` dit ce qu'aucun texte de page ne dit en clair :
 * qui rend le service, où, et par quel canal on le demande.
 *
 * `areaServed` reprend les communes du barème de livraison plutôt qu'une liste
 * propre : la maison ne se déplace pas plus loin pour un buffet que pour une
 * commande, et deux listes finiraient par diverger.
 */
export function cateringNode(profile: BusinessProfile, zones: Zone[]): JsonLdNode {
  const cities = [...new Set(zones.flatMap((z) => z.villes))];

  const node: JsonLdNode = {
    "@type": "Service",
    "@id": `${SITE_URL}/traiteur#service`,
    serviceType: "Traiteur",
    name: `Traiteur ${profile.city} — buffets, plateaux repas et réceptions`,
    description:
      `Service traiteur à ${profile.city} et alentours : buffets froids et chauds, ` +
      "plateaux repas pour réunions de bureau, mariages et réceptions. Cuisine " +
      "d'Afrique de l'Ouest, du Maghreb et de Méditerranée préparée maison. Devis gratuit.",
    url: abs("/traiteur"),
    provider: { "@id": NODE.restaurant },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: abs("/traiteur"),
      servicePhone: toE164(profile.phone),
      availableLanguage: { "@type": "Language", name: "Français", alternateName: "fr" },
    },
  };

  if (cities.length > 0) {
    node.areaServed = cities.map((city) => ({
      "@type": "City",
      name: city,
      address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "FR" },
    }));
  }

  return node;
}

/**
 * La page « À propos » en `AboutPage`, rattachée à l'organisation.
 *
 * La page ne portait qu'un fil d'Ariane, au motif qu'un nœud `Restaurant` de
 * plus y répéterait celui de l'accueil. Le raisonnement ne tient pas : un
 * moteur lit **chaque page isolément**, et rien ne lui disait de qui cette
 * page raconte l'histoire. « Chez Laila » y est partout en toutes lettres sans
 * qu'aucun balisage ne le relie à l'entreprise — c'est précisément la page qui
 * devrait consolider l'entité, et c'était la seule à ne rien en dire.
 *
 * `about` et `mainEntity` pointent le même nœud à dessein : le premier est ce
 * que Google lit pour rattacher la page à l'entité, le second est ce que lisent
 * les moteurs génératifs pour savoir quoi citer. Les deux visent le nœud
 * `Restaurant` de la page, qui doit donc figurer dans le même graphe.
 */
export function aboutPageNode(profile: BusinessProfile): JsonLdNode {
  const marque = profile.tagline ? `${profile.name} — ${profile.tagline}` : profile.name;

  return {
    "@type": "AboutPage",
    "@id": `${SITE_URL}/a-propos#page`,
    url: abs("/a-propos"),
    name: `À propos — ${marque}`,
    description: PAGE_META["/a-propos"].description,
    inLanguage: "fr-FR",
    isPartOf: { "@id": NODE.website },
    about: { "@id": NODE.restaurant },
    mainEntity: { "@id": NODE.restaurant },
  };
}

/** Fil d'Ariane — affiché tel quel sous le lien bleu dans les résultats. */
export function breadcrumbNode(trail: { name: string; path: string }[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: abs(step.path),
    })),
  };
}

/**
 * Questions fréquentes construites à partir des données réelles.
 *
 * Écrites nulle part à la main : livraison, horaires et paiement sortent des
 * réglages, donc la réponse balisée ne peut pas diverger du site. Google a
 * restreint l'affichage des résultats enrichis FAQ, mais ce balisage reste lu
 * par Bing et surtout par les moteurs génératifs, qui répondent « ils livrent à
 * Torcy à partir de 25 € » en le lisant ici.
 */
export function faqNode(input: {
  profile: BusinessProfile;
  zones: Zone[];
  hours: DayHours[];
  leadTimeMinutes: number;
  acceptsCash: boolean;
  acceptsCard: boolean;
  hoursLabels: { day: string; hours: string }[];
}): JsonLdNode | null {
  const { profile, zones, leadTimeMinutes, acceptsCash, acceptsCard, hoursLabels } = input;
  const qa: { q: string; a: string }[] = [];

  if (zones.length > 0) {
    const detail = zones
      .map(
        (z) =>
          `${z.villes.join(", ")} (minimum ${(z.minimumCents / 100).toFixed(2).replace(".", ",")} €, livraison ${(z.feeCents / 100).toFixed(2).replace(".", ",")} €)`,
      )
      .join(" ; ");
    qa.push({
      q: "Dans quelles communes Ô 3 Saveurs livre-t-il ?",
      a: `Ô 3 Saveurs livre depuis ${profile.city} dans les communes suivantes : ${detail}. Le montant minimum de commande et les frais de livraison dépendent de la zone.`,
    });
  }

  if (hoursLabels.length > 0) {
    qa.push({
      q: "Quels sont les horaires d'ouverture ?",
      a: hoursLabels.map((h) => `${h.day} : ${h.hours}`).join(" · "),
    });
  }

  qa.push({
    q: "Quel type de cuisine sert Ô 3 Saveurs — Chez Laila ?",
    a: "Une cuisine du monde préparée maison : spécialités d'Afrique de l'Ouest (thiéboudiène, mafé, yassa), du Maghreb (tajines, couscous) et de Méditerranée, ainsi que des grillades, sandwichs, salades et desserts maison.",
  });

  qa.push({
    q: "Comment commander et en combien de temps la commande est-elle prête ?",
    a: `La commande se passe en ligne sur ${SITE_URL}/carte, en livraison ou à emporter, ou par téléphone au ${profile.phone}. Le délai de préparation annoncé est d'environ ${leadTimeMinutes} minutes.`,
  });

  const moyens = [
    ...(acceptsCard ? ["carte bancaire en ligne"] : []),
    ...(acceptsCash ? ["espèces à la livraison ou au retrait"] : []),
    "titres-restaurant sur place",
  ];
  qa.push({
    q: "Quels moyens de paiement sont acceptés ?",
    a: `Moyens acceptés : ${moyens.join(", ")}.`,
  });

  qa.push({
    q: "Où se trouve le restaurant ?",
    a: `${profile.name} — ${profile.tagline} se situe ${profile.street}, ${profile.zip} ${profile.city}, en Seine-et-Marne. Téléphone : ${profile.phone}.`,
  });

  if (qa.length === 0) return null;

  return {
    "@type": "FAQPage",
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** Assemble un graphe unique — un seul bloc, des nœuds qui se référencent. */
export function graph(nodes: (JsonLdNode | null)[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": nodes.filter((n): n is JsonLdNode => n !== null),
  });
}
