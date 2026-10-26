import type { DayHours } from "@/lib/hours";

/**
 * Semaine de test, découplée de `DEFAULT_HOURS`.
 *
 * Les tests d'horaires lisaient les horaires par défaut du restaurant. Quand le
 * dépliant 2026 les a changés (plus aucun midi fermé, soir jusqu'à 22h30), une
 * vingtaine de tests sont tombés alors qu'aucune règle n'avait changé — et les
 * cas « fermé le midi », qui sont ceux qui comptent, ne pouvaient plus être
 * exercés. Cette semaine les garde : vendredi et dimanche fermés le midi, soir
 * jusqu'à 22h45.
 */
export const SEMAINE_TYPE: DayHours[] = [
  { weekday: 0, closed: false, lunchOpen: null, lunchClose: null, dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 1, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 2, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 3, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 4, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 5, closed: false, lunchOpen: null, lunchClose: null, dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 6, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
];
