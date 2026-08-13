import { describe, it, expect } from "vitest";
import {
  cartLeadTimeHours,
  checkPreorderSchedule,
  formatLeadTime,
  formatPreorderDay,
  formatPreorderSchedule,
  isPreorderDish,
  parisInstant,
  preorderDays,
} from "@/lib/preorder";
import type { DayHours } from "@/lib/hours";

/* Horaires de référence du restaurant : fermé le midi le dimanche et le
 * vendredi, service de 11:30 à 14:30 et de 18:00 à 22:45 les autres jours. */
const HOURS: DayHours[] = [
  { weekday: 0, closed: false, lunchOpen: null, lunchClose: null, dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 1, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 2, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 3, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 4, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 5, closed: false, lunchOpen: null, lunchClose: null, dinnerOpen: "18:00", dinnerClose: "22:45" },
  { weekday: 6, closed: false, lunchOpen: "11:30", lunchClose: "14:30", dinnerOpen: "18:00", dinnerClose: "22:45" },
];

/** Lundi 10 août 2026, 12:00 à Paris (10:00 UTC, heure d'été). */
const LUNDI_MIDI = new Date("2026-08-10T10:00:00.000Z");

describe("isPreorderDish", () => {
  it("un plat sans délai est servi au créneau habituel", () => {
    expect(isPreorderDish({ leadTimeHours: 0 })).toBe(false);
  });

  it("un délai non nul fait du plat une réservation", () => {
    expect(isPreorderDish({ leadTimeHours: 48 })).toBe(true);
  });
});

describe("cartLeadTimeHours", () => {
  it("un panier sans plat sur commande n'impose aucun délai", () => {
    expect(cartLeadTimeHours([{ leadTimeHours: 0 }, { leadTimeHours: 0 }])).toBe(0);
  });

  /* Une commande ne se scinde pas : les pastels partent avec le gigot, donc au
   * rythme du gigot. Prendre le minimum ferait promettre un retrait le jour
   * même pour une pièce qui n'est même pas achetée. */
  it("retient le plat le plus lent, pas le plus rapide", () => {
    expect(cartLeadTimeHours([{ leadTimeHours: 0 }, { leadTimeHours: 48 }, { leadTimeHours: 72 }])).toBe(72);
  });

  it("un panier vide n'impose aucun délai", () => {
    expect(cartLeadTimeHours([])).toBe(0);
  });
});

describe("parisInstant", () => {
  it("interprète l'heure en heure de Paris, pas en UTC", () => {
    // Heure d'été : Paris est à UTC+2 le 13 août.
    expect(parisInstant("2026-08-13", "19:30").toISOString()).toBe("2026-08-13T17:30:00.000Z");
  });

  it("suit le changement d'heure d'hiver", () => {
    // Heure d'hiver : Paris est à UTC+1 le 13 décembre.
    expect(parisInstant("2026-12-13", "19:30").toISOString()).toBe("2026-12-13T18:30:00.000Z");
  });
});

describe("preorderDays", () => {
  it("ne propose aucun créneau avant l'expiration du délai", () => {
    const days = preorderDays(HOURS, 48, { at: LUNDI_MIDI });
    const premier = days[0];

    // 48 h après lundi 12:00 = mercredi 12:00. Le premier créneau proposé ne
    // peut donc pas être antérieur, ni tomber avant mercredi.
    expect(premier.date).toBe("2026-08-12");
    expect(parisInstant(premier.date, premier.slots[0]).getTime()).toBeGreaterThanOrEqual(
      LUNDI_MIDI.getTime() + 48 * 3600_000,
    );
  });

  it("écarte les jours entièrement avalés par le délai", () => {
    const days = preorderDays(HOURS, 48, { at: LUNDI_MIDI });
    expect(days.map((d) => d.date)).not.toContain("2026-08-10");
    expect(days.map((d) => d.date)).not.toContain("2026-08-11");
  });

  it("ne propose pas le service du midi les jours où il n'existe pas", () => {
    // Vendredi 14 août : fermé le midi, service du soir uniquement.
    const vendredi = preorderDays(HOURS, 48, { at: LUNDI_MIDI }).find(
      (d) => d.date === "2026-08-14",
    );
    expect(vendredi).toBeDefined();
    expect(vendredi!.slots.every((s) => s >= "18:00")).toBe(true);
  });

  it("s'arrête un pas avant la fermeture — le dernier plat doit être servi", () => {
    const jour = preorderDays(HOURS, 48, { at: LUNDI_MIDI }).find((d) => d.date === "2026-08-13");
    expect(jour!.slots).toContain("22:00");
    expect(jour!.slots).not.toContain("22:30");
  });

  it("ne renvoie que des jours réellement servables", () => {
    const days = preorderDays(HOURS, 48, { at: LUNDI_MIDI });
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.slots.length > 0)).toBe(true);
  });

  it("un restaurant fermé toute la semaine ne propose rien", () => {
    const ferme = HOURS.map((h) => ({ ...h, closed: true }));
    expect(preorderDays(ferme, 48, { at: LUNDI_MIDI })).toEqual([]);
  });

  it("s'arrête à l'horizon demandé", () => {
    const days = preorderDays(HOURS, 48, { at: LUNDI_MIDI, horizonDays: 5 });
    expect(days.every((d) => d.date <= "2026-08-15")).toBe(true);
  });
});

describe("checkPreorderSchedule", () => {
  const check = (date: unknown, slot: unknown, leadTimeHours = 48) =>
    checkPreorderSchedule(HOURS, { date, slot, leadTimeHours, at: LUNDI_MIDI });

  it("accepte une date proposée et renvoie l'instant réel", () => {
    const res = check("2026-08-13", "19:30");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.at.toISOString()).toBe("2026-08-13T17:30:00.000Z");
  });

  /* Le cœur du contrôle : sans lui, un client forgeant la requête réserverait
   * un gigot pour le soir même, et la cuisine découvrirait la commande sans
   * avoir la viande. */
  it("refuse une date plus proche que le délai", () => {
    const res = check("2026-08-11", "19:30");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("première possible");
  });

  it("refuse une heure hors service", () => {
    const res = check("2026-08-13", "16:00");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("16:00");
  });

  it("refuse le service du midi un jour où il n'existe pas", () => {
    // Vendredi 14 août, fermé le midi.
    expect(check("2026-08-14", "12:00").ok).toBe(false);
  });

  it("refuse une date malformée", () => {
    expect(check("13/08/2026", "19:30").ok).toBe(false);
    expect(check(null, "19:30").ok).toBe(false);
    expect(check(undefined, "19:30").ok).toBe(false);
  });

  it("refuse une heure malformée", () => {
    expect(check("2026-08-13", "19h30").ok).toBe(false);
    expect(check("2026-08-13", 1930).ok).toBe(false);
  });

  /* Le contrôle est construit sur `preorderDays` : ce que le tunnel propose et
   * ce que le serveur accepte ne peuvent pas diverger. */
  it("accepte exactement ce que le tunnel propose", () => {
    for (const day of preorderDays(HOURS, 72, { at: LUNDI_MIDI, horizonDays: 4 })) {
      for (const slot of day.slots) {
        expect(checkPreorderSchedule(HOURS, {
          date: day.date,
          slot,
          leadTimeHours: 72,
          at: LUNDI_MIDI,
        }).ok).toBe(true);
      }
    }
  });
});

describe("formatage", () => {
  it("nomme le jour en français, première lettre en capitale", () => {
    expect(formatPreorderDay("2026-08-13")).toBe("Jeudi 13 août");
  });

  it("compose jour et heure", () => {
    expect(formatPreorderSchedule(parisInstant("2026-08-13", "19:30"))).toBe(
      "Jeudi 13 août à 19:30",
    );
  });

  it("dit le délai comme un client le lit", () => {
    expect(formatLeadTime(0)).toBe("sans délai");
    expect(formatLeadTime(12)).toBe("12 h");
    expect(formatLeadTime(48)).toBe("2 jours");
    expect(formatLeadTime(72)).toBe("3 jours");
    expect(formatLeadTime(36)).toBe("36 h");
  });
});
