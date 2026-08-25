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
 */
export const PUBLIC_ROUTES = [
  { path: "/", label: "Accueil", priority: 1, changeFrequency: "weekly" },
  { path: "/carte", label: "La Carte", priority: 0.9, changeFrequency: "weekly" },
  { path: "/formules", label: "Nos Formules", priority: 0.8, changeFrequency: "weekly" },
  { path: "/traiteur", label: "Traiteur", priority: 0.7, changeFrequency: "monthly" },
  { path: "/a-propos", label: "À propos", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", label: "Contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/allergenes", label: "Allergènes", priority: 0.4, changeFrequency: "monthly" },
  /* `/commander` n'y figure pas : le tunnel de commande est en `noindex` (voir
   * `app/commander/page.tsx`), et un plan du site qui déclare une page
   * interdite d'index est une contradiction que Search Console signale. */
  { path: "/mentions-legales", label: "Mentions légales", priority: 0.1, changeFrequency: "yearly" },
  { path: "/cgv", label: "CGV", priority: 0.1, changeFrequency: "yearly" },
  { path: "/confidentialite", label: "Confidentialité", priority: 0.1, changeFrequency: "yearly" },
] as const satisfies readonly {
  path: string;
  label: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
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
 */
export function priceRange(dishes: Dish[]): string {
  const prices = dishes
    .filter((d) => !(PRICE_RANGE_EXCLUDED_CATS as readonly string[]).includes(d.cat))
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
