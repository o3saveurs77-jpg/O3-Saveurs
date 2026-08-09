import { describe, it, expect } from "vitest";
import {
  buildCalendar,
  emptyDays,
  resolveDay,
  type SpecialEntry,
} from "@/lib/dailySpecialCalendar";

/**
 * Le calendrier ne doit jamais promettre autre chose que ce que le site
 * affichera : il rejoue exactement la règle de `lib/dailySpecial.ts`.
 */

const DAY = 86_400_000;
/** Lundi 10 août 2026, minuit. */
const LUNDI = Date.UTC(2026, 7, 10);
const LUNDI_WD = 1;

const entry = (over: Partial<SpecialEntry> = {}): SpecialEntry => ({
  id: "s1",
  name: "Tajine du jour",
  priceCents: 1290,
  weekday: null,
  date: null,
  active: true,
  position: 0,
  ...over,
});

describe("ce qui sera affiché un jour donné", () => {
  it("retient la récurrence hebdomadaire", () => {
    const d = resolveDay([entry({ weekday: 1 })], LUNDI, LUNDI_WD);
    expect(d.entry?.name).toBe("Tajine du jour");
    expect(d.source).toBe("weekday");
  });

  it("retient une date précise", () => {
    const d = resolveDay([entry({ date: LUNDI })], LUNDI, LUNDI_WD);
    expect(d.source).toBe("date");
  });

  it("fait primer la date sur la récurrence — comme le site", () => {
    /* La règle vit dans lib/dailySpecial.ts ; la contredire ici afficherait un
     * plat dans le calendrier et un autre sur l'accueil. */
    const d = resolveDay(
      [entry({ id: "hebdo", weekday: 1, name: "Habituel" }), entry({ id: "fixe", date: LUNDI, name: "Exception" })],
      LUNDI,
      LUNDI_WD,
    );
    expect(d.entry?.name).toBe("Exception");
    expect(d.source).toBe("date");
  });

  it("ignore une entrée désactivée", () => {
    expect(resolveDay([entry({ weekday: 1, active: false })], LUNDI, LUNDI_WD).entry).toBeNull();
  });

  it("ignore une date qui n'est pas celle du jour", () => {
    expect(resolveDay([entry({ date: LUNDI + DAY })], LUNDI, LUNDI_WD).entry).toBeNull();
  });

  it("départage deux récurrences par la position", () => {
    const d = resolveDay(
      [entry({ id: "b", weekday: 1, name: "Second", position: 2 }), entry({ id: "a", weekday: 1, name: "Premier", position: 1 })],
      LUNDI,
      LUNDI_WD,
    );
    expect(d.entry?.name).toBe("Premier");
  });

  it("renvoie « aucun » quand rien n'est prévu", () => {
    const d = resolveDay([entry({ weekday: 3 })], LUNDI, LUNDI_WD);
    expect(d.entry).toBeNull();
    expect(d.source).toBe("aucun");
  });
});

describe("calendrier sur plusieurs semaines", () => {
  it("déroule les jours et fait tourner la semaine", () => {
    const cal = buildCalendar([], LUNDI, LUNDI_WD, 9);
    expect(cal).toHaveLength(9);
    expect(cal[0].weekday).toBe(1);
    expect(cal[6].weekday).toBe(0); // dimanche
    expect(cal[7].weekday).toBe(1); // lundi suivant
    expect(cal[8].at).toBe(LUNDI + 8 * DAY);
  });

  it("applique une récurrence à chaque semaine", () => {
    const cal = buildCalendar([entry({ weekday: 1 })], LUNDI, LUNDI_WD, 15);
    expect(cal[0].entry).not.toBeNull();
    expect(cal[7].entry).not.toBeNull();
    expect(cal[14].entry).not.toBeNull();
    expect(cal[1].entry).toBeNull();
  });

  it("laisse une exception ponctuelle n'affecter que son jour", () => {
    const cal = buildCalendar(
      [entry({ id: "h", weekday: 1, name: "Habituel" }), entry({ id: "f", date: LUNDI + 7 * DAY, name: "Exception" })],
      LUNDI,
      LUNDI_WD,
      15,
    );
    expect(cal[0].entry?.name).toBe("Habituel");
    expect(cal[7].entry?.name).toBe("Exception");
    expect(cal[14].entry?.name).toBe("Habituel");
  });

  it("liste les jours à trous — l'intérêt même du calendrier", () => {
    const cal = buildCalendar([entry({ weekday: 1 })], LUNDI, LUNDI_WD, 7);
    const vides = emptyDays(cal);
    expect(vides).toHaveLength(6);
    expect(vides.every((d) => d.weekday !== 1)).toBe(true);
  });

  it("ne signale aucun trou quand toute la semaine est couverte", () => {
    const semaine = [0, 1, 2, 3, 4, 5, 6].map((w) => entry({ id: `w${w}`, weekday: w }));
    expect(emptyDays(buildCalendar(semaine, LUNDI, LUNDI_WD, 14))).toHaveLength(0);
  });
});
