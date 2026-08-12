/* Plats sur commande — règles pures.
 *
 * Un gigot, une paella pour vingt ou un agneau entier ne se lancent pas à
 * réception de la commande : il faut acheter la viande, la faire préparer par
 * le boucher, occuper le four plusieurs heures. La cliente veut donc pouvoir
 * les vendre en ligne, mais avec deux garde-fous :
 *
 *  · **un délai** — la date de retrait ne peut pas être plus proche que le
 *    délai du plat (48 h par défaut, réglable plat par plat depuis l'admin) ;
 *  · **un accord** — le restaurant garde la main. Une commande sur commande est
 *    payée puis mise « à valider » : elle n'entre en cuisine qu'une fois
 *    acceptée, et un refus rend intégralement l'argent.
 *
 * Tout ce qui décide « cette date est-elle acceptable » vit ici, sans Prisma :
 * le même calcul sert à *proposer* les créneaux au client et à les *refuser*
 * côté serveur. Impossible de proposer une date que le checkout rejettera —
 * c'est la règle déjà appliquée aux créneaux du jour dans `lib/hours.ts`.
 *
 * Tous les calculs sont faits en heure de Paris, quel que soit le fuseau du
 * serveur ou du navigateur.
 */

import {
  PARIS_TZ,
  WEEKDAY_LABEL,
  fromMinutes,
  parisYmd,
  toMinutes,
  type DayHours,
} from "@/lib/hours";

/** Délai retenu quand la cliente coche « sur commande » sans préciser. */
export const DEFAULT_LEAD_TIME_HOURS = 48;

/** Au-delà, on ne prend plus de réservation : un mois couvre large. */
export const PREORDER_HORIZON_DAYS = 30;

/** Ce plat doit-il être commandé à l'avance ? */
export function isPreorderDish(dish: { leadTimeHours: number }): boolean {
  return dish.leadTimeHours > 0;
}

/**
 * Délai d'un panier : le plus long de ses plats.
 *
 * Une commande ne se scinde pas — un gigot à 48 h et des pastels servis à la
 * minute partent ensemble, donc au rythme du plus lent. Zéro si le panier ne
 * contient aucun plat sur commande : c'est une commande du jour ordinaire.
 */
export function cartLeadTimeHours(dishes: { leadTimeHours: number }[]): number {
  return dishes.reduce((max, d) => Math.max(max, d.leadTimeHours || 0), 0);
}

// ─── Conversions heure de Paris ────────────────────────────────

/** Décalage de Paris par rapport à UTC, en millisecondes, à cet instant. */
function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(at); // « 2026-08-13 19:30:00 »
  return new Date(`${parts.replace(" ", "T")}Z`).getTime() - at.getTime();
}

/**
 * Instant réel correspondant à une date et une heure **de Paris**.
 *
 * Deux passes : le décalage à appliquer est celui en vigueur à l'instant
 * cherché, pas à l'instant approché. Sans la seconde passe, une commande posée
 * au changement d'heure de fin mars tomberait une heure à côté.
 */
export function parisInstant(ymd: string, hhmm: string): Date {
  const naive = new Date(`${ymd}T${hhmm}:00.000Z`);
  const approx = new Date(naive.getTime() - parisOffsetMs(naive));
  return new Date(naive.getTime() - parisOffsetMs(approx));
}

/** « 2026-08-13 » → « Jeudi 13 août ». */
export function formatPreorderDay(ymd: string): string {
  const at = new Date(`${ymd}T12:00:00.000Z`);
  const label = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « 2026-08-13 » + « 19:30 » → « Jeudi 13 août à 19:30 ». */
export function formatPreorderSchedule(at: Date): string {
  const jour = formatPreorderDay(parisYmd(at));
  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return `${jour} à ${heure}`;
}

/** Jour de la semaine (0 = dimanche) d'une date « 2026-08-13 » en heure de Paris. */
function weekdayOf(ymd: string): number {
  const short = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    weekday: "short",
  })
    .format(new Date(`${ymd}T12:00:00.000Z`))
    .toLowerCase();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(short);
}

/** Date « 2026-08-13 » décalée de n jours. */
function addDays(ymd: string, n: number): string {
  const at = new Date(`${ymd}T12:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

// ─── Créneaux proposables ──────────────────────────────────────

export interface PreorderDay {
  /** « 2026-08-13 » */
  date: string;
  /** « Jeudi 13 août » */
  label: string;
  /** « Jeudi » */
  weekdayLabel: string;
  /** heures de retrait proposables ce jour-là, « 12:00 », « 12:30 »… */
  slots: string[];
}

interface PreorderOptions {
  at?: Date;
  stepMinutes?: number;
  horizonDays?: number;
}

/**
 * Jours et heures réellement proposables pour un plat sur commande.
 *
 * Un créneau n'est retenu que s'il tombe pendant un service ouvert **et** au
 * moins `leadTimeHours` après maintenant. Les jours sans aucun créneau — le
 * restaurant est fermé, ou le délai les avale entièrement — ne sont pas
 * renvoyés : le sélecteur du client ne montre que des dates cliquables.
 */
export function preorderDays(
  hours: DayHours[],
  leadTimeHours: number,
  { at = new Date(), stepMinutes = 30, horizonDays = PREORDER_HORIZON_DAYS }: PreorderOptions = {},
): PreorderDay[] {
  const earliest = at.getTime() + Math.max(0, leadTimeHours) * 3600_000;
  const from = parisYmd(at);
  const out: PreorderDay[] = [];

  for (let offset = 0; offset <= horizonDays; offset++) {
    const date = addDays(from, offset);
    const day = hours.find((h) => h.weekday === weekdayOf(date));
    if (!day || day.closed) continue;

    const slots: string[] = [];
    for (const [open, close] of servicesOf(day)) {
      const first = Math.ceil(open / stepMinutes) * stepMinutes;
      // Dernière commande servie : on s'arrête un pas avant la fermeture,
      // comme pour les créneaux du jour.
      for (let t = first; t <= close - stepMinutes; t += stepMinutes) {
        const hhmm = fromMinutes(t);
        if (parisInstant(date, hhmm).getTime() >= earliest) slots.push(hhmm);
      }
    }

    if (slots.length) {
      out.push({
        date,
        label: formatPreorderDay(date),
        weekdayLabel: WEEKDAY_LABEL[weekdayOf(date)],
        slots,
      });
    }
  }

  return out;
}

/** Bornes des services ouverts d'une journée, en minutes depuis minuit. */
function servicesOf(day: DayHours): [number, number][] {
  const out: [number, number][] = [];
  if (day.lunchOpen && day.lunchClose) out.push([toMinutes(day.lunchOpen), toMinutes(day.lunchClose)]);
  if (day.dinnerOpen && day.dinnerClose) {
    out.push([toMinutes(day.dinnerOpen), toMinutes(day.dinnerClose)]);
  }
  return out;
}

export type ScheduleCheck =
  | { ok: true; at: Date }
  | { ok: false; error: string };

/**
 * Contrôle serveur d'une date de retrait sur commande.
 *
 * Volontairement construit sur `preorderDays` plutôt que sur un calcul
 * parallèle : un client qui forge une requête se heurte exactement à la liste
 * que le tunnel lui a proposée, sans qu'un écart de règle puisse s'installer
 * entre les deux au fil des modifications.
 */
export function checkPreorderSchedule(
  hours: DayHours[],
  {
    date,
    slot,
    leadTimeHours,
    at = new Date(),
    stepMinutes = 30,
  }: { date: unknown; slot: unknown; leadTimeHours: number; at?: Date; stepMinutes?: number },
): ScheduleCheck {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Choisissez une date de retrait." };
  }
  if (typeof slot !== "string" || !/^\d{2}:\d{2}$/.test(slot)) {
    return { ok: false, error: "Choisissez une heure de retrait." };
  }

  const days = preorderDays(hours, leadTimeHours, { at, stepMinutes });
  const day = days.find((d) => d.date === date);
  if (!day) {
    const first = days[0];
    return {
      ok: false,
      error: first
        ? `Cette date n'est pas proposée. La première possible est le ${first.label.toLowerCase()}.`
        : "Aucune date n'est disponible pour ce plat en ce moment. Appelez-nous.",
    };
  }
  if (!day.slots.includes(slot)) {
    return { ok: false, error: `Nous ne servons pas à ${slot} le ${day.label.toLowerCase()}.` };
  }

  return { ok: true, at: parisInstant(date, slot) };
}

/** « 48 h » · « 3 jours » — délai exprimé pour un client, pas pour un serveur. */
export function formatLeadTime(hours: number): string {
  if (hours <= 0) return "sans délai";
  if (hours < 24) return `${hours} h`;
  const jours = Math.round(hours / 24);
  return hours % 24 === 0 && jours > 1 ? `${jours} jours` : `${hours} h`;
}
