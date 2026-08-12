/* Programmation du plat du jour sur plusieurs semaines — règles pures.
 *
 * Le modèle savait déjà tout faire : une entrée porte soit une `date` précise,
 * soit un `weekday` récurrent, et la date l'emporte. Ce qui manquait n'était
 * pas la capacité mais la **vue** : l'écran affichait une liste, où rien ne
 * signale que jeudi prochain n'a pas de plat. On ne s'en apercevait que le
 * jeudi, l'encart absent de l'accueil.
 *
 * Ce module résout, jour par jour, ce qui sera réellement affiché — avec la
 * même règle que `lib/dailySpecial.ts`, pour que le calendrier ne promette pas
 * autre chose que ce que le site montrera.
 */

export interface SpecialEntry {
  id: string;
  name: string;
  priceCents: number | null;
  /** 0 = dimanche … 6 = samedi. `null` quand l'entrée porte une date. */
  weekday: number | null;
  /** Date précise en millisecondes (minuit, Europe/Paris). */
  date: number | null;
  active: boolean;
  position: number;
}

export type DaySource = "date" | "weekday" | "aucun";

export interface CalendarDay {
  /** Minuit du jour, en millisecondes. */
  at: number;
  weekday: number;
  /** Ce que le site affichera ce jour-là, ou `null` si rien n'est prévu. */
  entry: SpecialEntry | null;
  /** D'où vient le plat retenu — une date fixée, ou la récurrence de la semaine. */
  source: DaySource;
}

const DAY_MS = 86_400_000;

/** Même jour civil, en comparant les dates à minuit. */
function sameDay(a: number, b: number): boolean {
  return Math.floor(a / DAY_MS) === Math.floor(b / DAY_MS);
}

/**
 * Ce qui sera affiché un jour donné.
 *
 * Reprend la règle du site : parmi les entrées actives, une date précise
 * l'emporte sur la récurrence hebdomadaire ; à égalité, la `position` tranche.
 */
export function resolveDay(entries: SpecialEntry[], at: number, weekday: number): CalendarDay {
  const actives = [...entries]
    .filter((e) => e.active)
    .sort((a, b) => a.position - b.position);

  const fixe = actives.find((e) => e.date !== null && sameDay(e.date, at));
  if (fixe) return { at, weekday, entry: fixe, source: "date" };

  const hebdo = actives.find((e) => e.date === null && e.weekday === weekday);
  if (hebdo) return { at, weekday, entry: hebdo, source: "weekday" };

  return { at, weekday, entry: null, source: "aucun" };
}

/**
 * Les `days` prochains jours, à partir de `from`.
 *
 * `from` et le jour de la semaine sont fournis par l'appelant plutôt que
 * calculés ici : le fuseau de Paris vit dans `lib/hours.ts`, et ce module doit
 * rester testable sans dépendre de l'heure de la machine.
 */
export function buildCalendar(
  entries: SpecialEntry[],
  from: number,
  fromWeekday: number,
  days = 28,
): CalendarDay[] {
  const out: CalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    out.push(resolveDay(entries, from + i * DAY_MS, (fromWeekday + i) % 7));
  }
  return out;
}

/** Jours sans plat prévu — ce que le calendrier doit signaler en premier. */
export function emptyDays(calendar: CalendarDay[]): CalendarDay[] {
  return calendar.filter((d) => d.entry === null);
}
