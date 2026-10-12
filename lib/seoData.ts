/* Chargement en base des données servant au balisage (voir `lib/seo.ts`).
 *
 * Séparé de `lib/seo.ts` pour que les constructeurs de JSON-LD restent purs et
 * testables sans Prisma. Ici vit la seule chose qui touche la base.
 *
 * Comme partout dans la vitrine : **la page ne tombe jamais**. Base injoignable
 * → on retombe sur les valeurs de `lib/menu.ts` et `lib/hours.ts`. Un incident
 * d'infrastructure doit dégrader le balisage, pas rendre une erreur 500 au
 * robot de Google — qui, lui, retiendrait la page comme cassée.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getSettings, getOpeningHours, deliveryOrigin, formatAddress } from "@/lib/settings";
import { DEFAULT_HOURS, WEEKDAY_LABEL, formatDayHours, type DayHours } from "@/lib/hours";
import { formatPhone, info, zones as seedZones, type Dish, type Zone } from "@/lib/menu";
import { rowToDish, rowToZone } from "@/lib/serialize";
import type { BusinessProfile } from "@/lib/seo";

export interface SeoContext {
  profile: BusinessProfile;
  hours: DayHours[];
  hoursLabels: { day: string; hours: string }[];
  zones: Zone[];
  dishes: Dish[];
  leadTimeMinutes: number;
  acceptsCash: boolean;
  acceptsCard: boolean;
}

/** Repli hors base — les constantes de seed, cohérentes avec le pied de page. */
function fallbackContext(): SeoContext {
  const [street, cityLine] = info.address.split(", ");
  const [zip, ...cityParts] = (cityLine ?? "").split(" ");
  return {
    profile: {
      name: info.name,
      tagline: info.tag,
      phone: info.phone,
      email: "contact@o3saveurs.fr",
      street: street ?? info.address,
      zip: zip ?? "77340",
      city: cityParts.join(" ") || "Pontault-Combault",
      lat: null,
      lng: null,
      socials: [],
    },
    hours: DEFAULT_HOURS,
    hoursLabels: DEFAULT_HOURS.map((d) => ({
      day: WEEKDAY_LABEL[d.weekday],
      hours: formatDayHours(d),
    })),
    zones: seedZones.map((z, idx) => ({
      idx,
      minimumCents: Math.round(z.min * 100),
      feeCents: Math.round(z.fee * 100),
      villes: [...z.villes],
      zips: [...(z.zips ?? [])],
    })),
    dishes: [],
    leadTimeMinutes: 35,
    acceptsCash: true,
    acceptsCard: true,
  };
}

/**
 * Tout ce dont le balisage a besoin, en une lecture.
 *
 * Mis en cache par la revalidation des pages qui l'appellent (300 s) : le
 * JSON-LD suit donc les réglages avec le même délai que la page visible, ce
 * qui est exactement ce qu'on veut — les deux ne peuvent pas se contredire.
 */
/** Une coordonnée vaut quelque chose si elle est finie et non nulle. */
function isUsable(n: number): boolean {
  return Number.isFinite(n) && n !== 0;
}

export async function loadSeoContext(): Promise<SeoContext> {
  try {
    const [settings, hours, zoneRows, dishRows] = await Promise.all([
      getSettings(),
      getOpeningHours(),
      prisma.zone.findMany({ orderBy: { idx: "asc" } }),
      prisma.dish.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
    ]);

    const repli = fallbackContext();

    /* Les coordonnées mémorisées ne valent que pour l'adresse qui a servi à les
     * calculer, et `delivery.originAddress` dit laquelle. Elles étaient lues
     * sans cette vérification : la base porte encore la trace du problème — les
     * coordonnées enregistrées sont celles d'une adresse à Lognes, et c'est ce
     * point-là que le nœud `Restaurant` déclarait à Google. `deliveryOrigin()`
     * sait recalculer et remémoriser ; on ne lit les réglages directement que
     * lorsqu'ils correspondent encore à l'adresse du restaurant. */
    const fraiches = settings["delivery.originAddress"] === formatAddress(settings);
    let lat = fraiches ? Number(settings["delivery.originLat"]) : NaN;
    let lng = fraiches ? Number(settings["delivery.originLng"]) : NaN;

    /* Coordonnées absentes ou périmées : on les fait calculer une fois, et
     * `deliveryOrigin()` les mémorise en base. Elles ne servaient jusqu'ici
     * qu'à la facturation au kilomètre, laquelle exige une clé Google absente —
     * donc elles n'étaient jamais calculées, et le nœud `Restaurant` sortait
     * sans `geo`. Le repli sur la Base Adresse Nationale (`lib/geo`) n'en
     * demande aucune.
     *
     * Un seul appel dans la vie du site : le résultat est écrit en réglages, et
     * la condition ci-dessous devient fausse dès le rendu suivant. En cas
     * d'échec — réseau, adresse non reconnue — on repart sans coordonnées,
     * exactement comme avant. */
    if (!isUsable(lat) || !isUsable(lng)) {
      const origin = await deliveryOrigin().catch(() => null);
      if (origin) {
        lat = origin.lat;
        lng = origin.lng;
      }
    }

    const socials = [
      settings["social.instagram"],
      settings["social.facebook"],
      settings["social.snapchat"],
    ]
      .map((s) => s.trim())
      .filter((s) => s.startsWith("http"));

    return {
      profile: {
        /* Un réglage vide ne doit pas effacer une coordonnée du balisage : le
         * repli de `lib/menu.ts` prend le relais clé par clé, comme le fait
         * déjà `lib/pageContent.ts`. Un `name` ou un téléphone absent du nœud
         * `Restaurant` vaut moins qu'une valeur un peu datée. */
        name: settings["restaurant.name"] || repli.profile.name,
        tagline: settings["restaurant.tagline"] || repli.profile.tagline,
        /* Mis en forme ici plutôt que chez chaque lecteur : `profile.phone`
         * part dans le JSON-LD (converti en E.164 par `toE164`), sur la page
         * Contact, dans `llms.txt` et dans les réponses de FAQ. Le réglage est
         * saisi à la main, et il l'a été collé — « 0954831275 » ressortait tel
         * quel dans les résultats de recherche. */
        phone: formatPhone(settings["restaurant.phone"]) || repli.profile.phone,
        email: settings["restaurant.email"] || repli.profile.email,
        street: settings["restaurant.address"] || repli.profile.street,
        zip: settings["restaurant.zip"] || repli.profile.zip,
        city: settings["restaurant.city"] || repli.profile.city,
        lat: isUsable(lat) ? lat : null,
        lng: isUsable(lng) ? lng : null,
        socials,
      },
      hours,
      hoursLabels: hours.map((d) => ({
        day: WEEKDAY_LABEL[d.weekday],
        hours: formatDayHours(d),
      })),
      zones: zoneRows.length > 0 ? zoneRows.map(rowToZone) : repli.zones,
      dishes: dishRows.map(rowToDish),
      leadTimeMinutes: Number(settings["order.leadTimeMinutes"]) || repli.leadTimeMinutes,
      acceptsCash: settings["order.acceptCash"] === "true",
      acceptsCard: settings["order.acceptCard"] === "true",
    };
  } catch {
    return fallbackContext();
  }
}
