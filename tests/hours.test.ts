import { describe, it, expect } from "vitest";
import {
  DEFAULT_HOURS,
  availableSlots,
  formatDayHours,
  fromMinutes,
  isOpenAt,
  isSlotAcceptable,
  nextService,
  parisNow,
  parisStartOfDay,
  toMinutes,
  type DayHours,
} from "@/lib/hours";

/* `lib/hours.ts` est pur et central : c'est lui qui décide si une commande est
 * acceptée, quels créneaux sont proposés et quel jour d'exploitation porte une
 * tournée. Tous les tests passent une date fixe en paramètre `at` — un test qui
 * dépendrait de l'heure courante passerait au vert le matin et au rouge le soir.
 *
 * Repères de dates (heure de Paris, UTC+2 en juillet) :
 *   lundi 20/07/2026    → 2026-07-20T…Z
 *   mercredi 22/07/2026 → jour « normal » : midi + soir
 *   vendredi 24/07/2026 → fermé le midi (cas réel du restaurant)
 *   dimanche 26/07/2026 → fermé le midi
 */

const LUNDI_11H = new Date("2026-07-20T09:00:00Z");
const MERCREDI_11H = new Date("2026-07-22T09:00:00Z");
const MERCREDI_12H = new Date("2026-07-22T10:00:00Z");
const MERCREDI_15H = new Date("2026-07-22T13:00:00Z");
const VENDREDI_12H = new Date("2026-07-24T10:00:00Z");
const VENDREDI_19H = new Date("2026-07-24T17:00:00Z");
const VENDREDI_23H = new Date("2026-07-24T21:00:00Z");
const DIMANCHE_12H = new Date("2026-07-26T10:00:00Z");

/** Tous les jours fermés, pour les cas dégénérés. */
const TOUT_FERME: DayHours[] = DEFAULT_HOURS.map((d) => ({
  ...d,
  closed: true,
  lunchOpen: null,
  lunchClose: null,
  dinnerOpen: null,
  dinnerClose: null,
}));

describe("toMinutes / fromMinutes", () => {
  it("convertit une heure en minutes depuis minuit", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("11:30")).toBe(690);
    expect(toMinutes("19:30")).toBe(1170);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("reformate des minutes sur deux chiffres", () => {
    expect(fromMinutes(0)).toBe("00:00");
    expect(fromMinutes(540)).toBe("09:00");
    expect(fromMinutes(1170)).toBe("19:30");
  });

  it("fait l'aller-retour sans perte", () => {
    for (const hhmm of ["00:00", "08:05", "11:30", "14:30", "18:00", "22:45"]) {
      expect(fromMinutes(toMinutes(hhmm))).toBe(hhmm);
    }
  });
});

describe("parisNow", () => {
  it("donne le jour et l'heure de Paris, pas ceux du serveur", () => {
    expect(parisNow(MERCREDI_12H)).toMatchObject({ weekday: 3, minutes: 720, hhmm: "12:00" });
    expect(parisNow(VENDREDI_23H)).toMatchObject({ weekday: 5, hhmm: "23:00" });
  });

  it("suit le changement d'heure (UTC+1 en janvier, UTC+2 en juillet)", () => {
    expect(parisNow(new Date("2026-01-14T09:00:00Z")).hhmm).toBe("10:00");
    expect(parisNow(new Date("2026-07-14T09:00:00Z")).hhmm).toBe("11:00");
  });
});

describe("parisStartOfDay", () => {
  it("regroupe sur le jour de Paris et non sur celui du serveur en UTC", () => {
    // 23 h 30 UTC un vendredi = 1 h 30 le samedi à Paris : la tournée du soir
    // appartient au samedi.
    expect(parisStartOfDay(new Date("2026-07-24T23:30:00Z")).toISOString()).toBe(
      "2026-07-25T00:00:00.000Z",
    );
    // Le service du soir reste bien sur son propre jour.
    expect(parisStartOfDay(VENDREDI_23H).toISOString()).toBe("2026-07-24T00:00:00.000Z");
  });

  it("est stable pour deux instants du même jour de Paris", () => {
    expect(parisStartOfDay(VENDREDI_12H).getTime()).toBe(parisStartOfDay(VENDREDI_19H).getTime());
  });
});

describe("isOpenAt", () => {
  it("ouvre le midi un jour de service complet", () => {
    expect(isOpenAt(DEFAULT_HOURS, MERCREDI_12H)).toBe(true);
  });

  it("reste fermé entre les deux services", () => {
    expect(isOpenAt(DEFAULT_HOURS, MERCREDI_15H)).toBe(false);
  });

  it("est fermé le midi le vendredi et le dimanche", () => {
    expect(isOpenAt(DEFAULT_HOURS, VENDREDI_12H)).toBe(false);
    expect(isOpenAt(DEFAULT_HOURS, DIMANCHE_12H)).toBe(false);
  });

  it("ouvre bien le soir ces mêmes jours", () => {
    expect(isOpenAt(DEFAULT_HOURS, VENDREDI_19H)).toBe(true);
  });

  it("est fermé avant l'ouverture du midi", () => {
    expect(isOpenAt(DEFAULT_HOURS, LUNDI_11H)).toBe(false);
  });

  it("est fermé quand la semaine entière est fermée", () => {
    expect(isOpenAt(TOUT_FERME, MERCREDI_12H)).toBe(false);
  });
});

describe("availableSlots", () => {
  it("respecte le délai de préparation et exclut les créneaux passés", () => {
    // 12:00 + 35 min de préparation → premier créneau à 13:00.
    const slots = availableSlots(DEFAULT_HOURS, { at: MERCREDI_12H });
    expect(slots).not.toContain("11:30");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("12:30");
    expect(slots[0]).toBe("13:00");
    expect(slots).toContain("14:00");
  });

  it("s'arrête un pas avant la fermeture", () => {
    const slots = availableSlots(DEFAULT_HOURS, { at: MERCREDI_12H });
    // Midi ferme à 14:30 → dernier créneau du midi à 14:00.
    expect(slots).not.toContain("14:30");
    // Soir ferme à 22:45, pas de 30 min depuis 18:00 → dernier créneau à 22:00.
    expect(slots[slots.length - 1]).toBe("22:00");
  });

  it("ne propose pas un créneau avant l'ouverture, même sans délai", () => {
    const slots = availableSlots(DEFAULT_HOURS, { at: MERCREDI_11H, leadTimeMinutes: 0 });
    expect(slots[0]).toBe("11:30");
    const avecDelai = availableSlots(DEFAULT_HOURS, { at: MERCREDI_11H });
    // 11:00 + 35 min = 11:35 → le créneau de 11:30 n'est plus tenable.
    expect(avecDelai[0]).toBe("12:00");
  });

  it("ne propose que le soir un jour fermé le midi", () => {
    const slots = availableSlots(DEFAULT_HOURS, { at: VENDREDI_12H });
    expect(slots[0]).toBe("18:00");
    expect(slots.some((s) => s < "15:00")).toBe(false);
  });

  it("ne propose plus rien après le dernier service", () => {
    expect(availableSlots(DEFAULT_HOURS, { at: VENDREDI_23H })).toEqual([]);
  });

  it("ne propose rien un jour fermé", () => {
    expect(availableSlots(TOUT_FERME, { at: MERCREDI_12H })).toEqual([]);
  });

  it("suit le pas demandé", () => {
    const slots = availableSlots(DEFAULT_HOURS, {
      at: MERCREDI_11H,
      stepMinutes: 15,
      leadTimeMinutes: 0,
    });
    expect(slots.slice(0, 3)).toEqual(["11:30", "11:45", "12:00"]);
  });
});

describe("isSlotAcceptable", () => {
  it("refuse 12:00 un vendredi (fermé le midi)", () => {
    expect(isSlotAcceptable(DEFAULT_HOURS, "12:00", { at: VENDREDI_12H })).toBe(false);
  });

  it("accepte 19:30 un vendredi", () => {
    expect(isSlotAcceptable(DEFAULT_HOURS, "19:30", { at: VENDREDI_12H })).toBe(true);
  });

  it("refuse un créneau déjà passé", () => {
    expect(isSlotAcceptable(DEFAULT_HOURS, "12:00", { at: MERCREDI_12H })).toBe(false);
    expect(isSlotAcceptable(DEFAULT_HOURS, "13:30", { at: MERCREDI_12H })).toBe(true);
  });

  it("refuse un créneau hors grille ou fantaisiste", () => {
    expect(isSlotAcceptable(DEFAULT_HOURS, "13:07", { at: MERCREDI_12H })).toBe(false);
    expect(isSlotAcceptable(DEFAULT_HOURS, "04:00", { at: MERCREDI_12H })).toBe(false);
    expect(isSlotAcceptable(DEFAULT_HOURS, "n'importe quoi", { at: MERCREDI_12H })).toBe(false);
  });

  it("n'accepte « asap » que pendant le service", () => {
    expect(isSlotAcceptable(DEFAULT_HOURS, "asap", { at: MERCREDI_12H })).toBe(true);
    expect(isSlotAcceptable(DEFAULT_HOURS, "asap", { at: MERCREDI_15H })).toBe(false);
    expect(isSlotAcceptable(DEFAULT_HOURS, "asap", { at: DIMANCHE_12H })).toBe(false);
    expect(isSlotAcceptable(DEFAULT_HOURS, "asap", { at: VENDREDI_23H })).toBe(false);
  });
});

describe("nextService", () => {
  it("annonce le service du soir depuis l'entre-deux-services", () => {
    expect(nextService(DEFAULT_HOURS, MERCREDI_15H)).toEqual({
      weekday: 3,
      label: "soir",
      opensAt: "18:00",
    });
  });

  it("saute le midi fermé du dimanche", () => {
    expect(nextService(DEFAULT_HOURS, DIMANCHE_12H)).toEqual({
      weekday: 0,
      label: "soir",
      opensAt: "18:00",
    });
  });

  it("passe au jour suivant en fin de service", () => {
    // Vendredi 23:00 : le soir est terminé → samedi midi.
    expect(nextService(DEFAULT_HOURS, VENDREDI_23H)).toEqual({
      weekday: 6,
      label: "midi",
      opensAt: "11:30",
    });
  });

  it("annonce le midi du jour avant l'ouverture", () => {
    expect(nextService(DEFAULT_HOURS, LUNDI_11H)).toEqual({
      weekday: 1,
      label: "midi",
      opensAt: "11:30",
    });
  });

  it("renvoie null quand rien n'est jamais ouvert", () => {
    expect(nextService(TOUT_FERME, MERCREDI_12H)).toBeNull();
  });
});

describe("formatDayHours", () => {
  it("affiche les deux services", () => {
    expect(formatDayHours(DEFAULT_HOURS[3])).toContain("11:30 – 14:30");
    expect(formatDayHours(DEFAULT_HOURS[3])).toContain("18:00 – 22:45");
  });

  it("signale le midi fermé", () => {
    expect(formatDayHours(DEFAULT_HOURS[5])).toContain("fermé le midi");
  });

  it("affiche « Fermé » pour un jour sans service", () => {
    expect(formatDayHours(TOUT_FERME[2])).toBe("Fermé");
  });
});
