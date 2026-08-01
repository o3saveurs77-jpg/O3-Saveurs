/* Réglages éditables depuis l'administration.
 *
 * Tout ce que la cliente doit pouvoir changer seule vit ici, pas dans le code :
 * coordonnées, informations légales, taux de TVA, seuils, textes. Les valeurs
 * par défaut ci-dessous servent de repli tant que la table `Setting` est vide.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_HOURS, type DayHours } from "@/lib/hours";

export const SETTING_DEFAULTS = {
  // Identité
  "restaurant.name": "Ô 3 Saveurs",
  "restaurant.tagline": "Chez Laila",
  "restaurant.phone": "01 72 84 52 44",
  "restaurant.email": "contact@o3saveurs.fr",
  "restaurant.address": "6 bis rue du Village",
  "restaurant.zip": "77185",
  "restaurant.city": "Lognes",

  // Informations légales — à renseigner par la cliente avant mise en ligne
  "legal.company": "",
  "legal.legalForm": "",
  "legal.siret": "",
  "legal.vatNumber": "",
  "legal.capital": "",
  "legal.publisher": "",
  "legal.host": "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  "legal.mediator": "",

  // Commercial
  "vat.rateBp": "1000", // 10 % — art. 279 m CGI
  "order.slotStepMinutes": "30",
  "order.slotCapacity": "8", // commandes max par créneau
  "order.leadTimeMinutes": "35", // délai de préparation annoncé
  "order.acceptCash": "true",
  "order.acceptCard": "true",

  // Newsletter
  "newsletter.enabled": "true",
  "newsletter.fromName": "Ô 3 Saveurs",

  // Réseaux
  "social.instagram": "",
  "social.snapchat": "",
  "social.facebook": "",

  // Liste de courses & budget prévisionnel
  "budget.caCents": "0", // chiffre d'affaires estimé sur la période
  "budget.days": "1", // nombre de jours de la période
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export type Settings = Record<SettingKey, string>;

/** Tous les réglages, valeurs par défaut comprises. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const out = { ...SETTING_DEFAULTS } as Record<string, string>;
  for (const row of rows) {
    if (row.key in SETTING_DEFAULTS) out[row.key] = row.value;
  }
  return out as Settings;
}

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getSettingInt(key: SettingKey, fallback = 0): Promise<number> {
  const n = Number(await getSetting(key));
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettingBool(key: SettingKey): Promise<boolean> {
  return (await getSetting(key)) === "true";
}

/** Écrit les réglages fournis ; les clés inconnues sont ignorées. */
export async function setSettings(patch: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => key in SETTING_DEFAULTS);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value ?? "") },
        update: { value: String(value ?? "") },
      }),
    ),
  );
}

/**
 * Horaires d'ouverture depuis la base, complétés par les valeurs par défaut
 * pour les jours absents. `lib/hours.ts` reste pur et testable ; l'accès à la
 * base est ici.
 */
export async function getOpeningHours(): Promise<DayHours[]> {
  const rows = await prisma.openingHours.findMany({ orderBy: { weekday: "asc" } });
  return DEFAULT_HOURS.map((fallback) => {
    const row = rows.find((r) => r.weekday === fallback.weekday);
    return row
      ? {
          weekday: row.weekday,
          closed: row.closed,
          lunchOpen: row.lunchOpen,
          lunchClose: row.lunchClose,
          dinnerOpen: row.dinnerOpen,
          dinnerClose: row.dinnerClose,
        }
      : fallback;
  });
}

/** Paramètres de créneaux, lus une seule fois par requête. */
export async function getSlotConfig(): Promise<{
  stepMinutes: number;
  leadTimeMinutes: number;
  capacity: number;
}> {
  const s = await getSettings();
  return {
    stepMinutes: Number(s["order.slotStepMinutes"]) || 30,
    leadTimeMinutes: Number(s["order.leadTimeMinutes"]) || 35,
    capacity: Number(s["order.slotCapacity"]) || 8,
  };
}

/** Adresse postale sur une ligne, pour les emails et les factures. */
export function formatAddress(s: Settings): string {
  return [s["restaurant.address"], `${s["restaurant.zip"]} ${s["restaurant.city"]}`.trim()]
    .filter(Boolean)
    .join(", ");
}

/**
 * Vrai quand toutes les informations légales obligatoires sont renseignées.
 * Sert à bloquer l'affichage d'une facture incomplète et à alerter dans l'admin.
 */
export function legalComplete(s: Settings): boolean {
  return !!(s["legal.company"] && s["legal.legalForm"] && s["legal.siret"]);
}
