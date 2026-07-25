/* Horaires d'ouverture et créneaux de commande.
 *
 * Les horaires étaient des chaînes décoratives (« 11h30 – 14h30 ») affichées
 * dans le pied de page, sans aucun effet : une commande pouvait être passée et
 * payée à 4 h du matin, et les créneaux proposés incluaient le midi les jours
 * où le restaurant est fermé le midi. Ce module dérive les créneaux réels d'une
 * structure typée, et sert autant à l'affichage qu'au refus côté serveur.
 *
 * Tous les calculs sont faits en heure de Paris, quel que soit le fuseau du
 * serveur ou du navigateur qui consulte.
 */

export const PARIS_TZ = "Europe/Paris";

export interface DayHours {
  weekday: number; // 0 = dimanche … 6 = samedi
  closed: boolean;
  lunchOpen: string | null; // "11:30"
  lunchClose: string | null;
  dinnerOpen: string | null;
  dinnerClose: string | null;
}

export const WEEKDAY_LABEL = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

/** Horaires de référence (spec §1), utilisés pour le seed initial. */
export const DEFAULT_HOURS: DayHours[] = [
  // Dimanche : fermé le midi
  { weekday: 0, closed: false, lunchOpen: null, lunchClose: null, dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 1, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 2, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 3, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 4, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  // Vendredi : fermé le midi
  { weekday: 5, closed: false, lunchOpen: null, lunchClose: null, dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 6, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
];

/** "19:30" → 1170 minutes depuis minuit. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/** 1170 → "19:30". */
export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Jour de la semaine et minutes depuis minuit, en heure de Paris. */
export function parisNow(at: Date = new Date()): { weekday: number; minutes: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const short = get("weekday").toLowerCase();
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(short);
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const minutes = hour * 60 + minute;

  return { weekday: weekday < 0 ? at.getDay() : weekday, minutes, hhmm: fromMinutes(minutes) };
}

/** Minuit à Paris pour la date donnée — clé de regroupement des tournées et des KPIs. */
export function parisStartOfDay(at: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return new Date(`${ymd}T00:00:00.000Z`);
}

interface Service {
  open: number;
  close: number;
  label: "midi" | "soir";
}

function servicesOf(day: DayHours): Service[] {
  if (day.closed) return [];
  const out: Service[] = [];
  if (day.lunchOpen && day.lunchClose) {
    out.push({ open: toMinutes(day.lunchOpen), close: toMinutes(day.lunchClose), label: "midi" });
  }
  if (day.dinnerOpen && day.dinnerClose) {
    out.push({ open: toMinutes(day.dinnerOpen), close: toMinutes(day.dinnerClose), label: "soir" });
  }
  return out;
}

/** Le restaurant prend-il des commandes maintenant ? */
export function isOpenAt(hours: DayHours[], at: Date = new Date()): boolean {
  const { weekday, minutes } = parisNow(at);
  const day = hours.find((h) => h.weekday === weekday);
  if (!day) return false;
  return servicesOf(day).some((s) => minutes >= s.open && minutes <= s.close);
}

/** Prochain service à venir, pour le message « Fermé — commandez pour … ». */
export function nextService(
  hours: DayHours[],
  at: Date = new Date(),
): { weekday: number; label: "midi" | "soir"; opensAt: string } | null {
  const { weekday, minutes } = parisNow(at);
  for (let offset = 0; offset < 8; offset++) {
    const wd = (weekday + offset) % 7;
    const day = hours.find((h) => h.weekday === wd);
    if (!day) continue;
    for (const s of servicesOf(day)) {
      if (offset > 0 || s.open > minutes) {
        return { weekday: wd, label: s.label, opensAt: fromMinutes(s.open) };
      }
    }
  }
  return null;
}

/**
 * Créneaux de retrait/livraison réellement proposables aujourd'hui.
 * Exclut les services fermés, les créneaux déjà passés, et laisse le délai de
 * préparation (`leadTimeMinutes`) avant le premier créneau disponible.
 */
export function availableSlots(
  hours: DayHours[],
  {
    at = new Date(),
    stepMinutes = 30,
    leadTimeMinutes = 35,
  }: { at?: Date; stepMinutes?: number; leadTimeMinutes?: number } = {},
): string[] {
  const { weekday, minutes } = parisNow(at);
  const day = hours.find((h) => h.weekday === weekday);
  if (!day) return [];

  const earliest = minutes + leadTimeMinutes;
  const slots: string[] = [];

  for (const service of servicesOf(day)) {
    const first = Math.ceil(Math.max(service.open, earliest) / stepMinutes) * stepMinutes;
    // dernière commande servie : on s'arrête un pas avant la fermeture
    for (let t = first; t <= service.close - stepMinutes; t += stepMinutes) {
      slots.push(fromMinutes(t));
    }
  }
  return slots;
}

/**
 * Un créneau est-il acceptable à cet instant ? Utilisé côté serveur pour
 * refuser une commande forgée hors service.
 * `"asap"` n'est valide que si le restaurant est ouvert.
 */
export function isSlotAcceptable(
  hours: DayHours[],
  slot: string,
  opts: { at?: Date; stepMinutes?: number; leadTimeMinutes?: number } = {},
): boolean {
  const at = opts.at ?? new Date();
  if (slot === "asap") return isOpenAt(hours, at);
  return availableSlots(hours, { ...opts, at }).includes(slot);
}

/** Rendu lisible pour le pied de page et la page Contact. */
export function formatDayHours(day: DayHours): string {
  if (day.closed) return "Fermé";
  const parts: string[] = [];
  if (day.lunchOpen && day.lunchClose) parts.push(`${day.lunchOpen} – ${day.lunchClose}`);
  if (day.dinnerOpen && day.dinnerClose) parts.push(`${day.dinnerOpen} – ${day.dinnerClose}`);
  if (!parts.length) return "Fermé";
  const suffix = !day.lunchOpen ? "  ·  (fermé le midi)" : "";
  return parts.join("  ·  ") + suffix;
}
