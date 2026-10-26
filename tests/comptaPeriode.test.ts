import { describe, it, expect } from "vitest";
import {
  parisMonthStartInput,
  parisPeriodRange,
  parisTodayInput,
} from "@/components/admin/ComptaAdmin";
import { inRange } from "@/lib/analytics";
import type { Order } from "@/lib/types";

/* Bornes de la période comptable — en heure de Paris.
 *
 * L'écran Compta était décalé d'un jour : `startOfMonth()` prenait minuit
 * **local** et `toInputDate()` en rendait la date **UTC** (`toISOString()`).
 * À Paris en heure d'été, le 1er septembre 00:00 devenait « 2026-08-31 ».
 * Ouvrir l'écran et cliquer « Ventilation TVA » sans toucher aux dates
 * produisait donc une déclaration de septembre contenant tout le service du
 * soir du 31 août — déjà déclaré en août.
 *
 * Ces tests tiennent les deux bouts : la date proposée par défaut, et les
 * instants réels des bornes. Ils ne dépendent pas du fuseau de la machine qui
 * les exécute : c'est tout l'intérêt.
 */

/** Minuit à Paris le 1er septembre 2026 (heure d'été, UTC+2). */
const SEPT_1 = Date.UTC(2026, 7, 31, 22, 0, 0);
/** Minuit à Paris le 1er octobre 2026. */
const OCT_1 = Date.UTC(2026, 8, 30, 22, 0, 0);
/** Minuit à Paris le 1er novembre 2026 (heure d'hiver, UTC+1). */
const NOV_1 = Date.UTC(2026, 9, 31, 23, 0, 0);

describe("date proposée à l'ouverture", () => {
  it("rend la date civile de Paris, et non la date UTC", () => {
    // 31 août 22:30 UTC = 1er septembre 00:30 à Paris : on est en septembre.
    const justeApresMinuitAParis = new Date("2026-08-31T22:30:00.000Z");
    expect(parisTodayInput(justeApresMinuitAParis)).toBe("2026-09-01");
    expect(parisMonthStartInput(justeApresMinuitAParis)).toBe("2026-09-01");
  });

  it("ne recule pas d'un jour en fin de mois — le défaut était « 2026-08-31 »", () => {
    // Minuit pile à Paris le 1er septembre : c'est la valeur que l'ancien code
    // convertissait en « 2026-08-31 » via toISOString().
    expect(parisMonthStartInput(new Date(SEPT_1))).toBe("2026-09-01");
  });

  it("tient aussi en heure d'hiver", () => {
    expect(parisMonthStartInput(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
    expect(parisTodayInput(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("bornes de période", () => {
  it("part de minuit à Paris, pas de minuit UTC", () => {
    const r = parisPeriodRange("2026-09-01", "2026-09-30");
    expect(r).not.toBeNull();
    expect(r?.start).toBe(SEPT_1);
    // Borne haute exclusive : minuit du 1er octobre.
    expect(r?.end).toBe(OCT_1);
  });

  it("suit le changement d'heure : octobre 2026 ne commence ni ne finit au même décalage", () => {
    const r = parisPeriodRange("2026-10-01", "2026-10-31");
    expect(r?.start).toBe(OCT_1); // UTC+2
    expect(r?.end).toBe(NOV_1); // UTC+1
  });

  it("couvre les 25 heures du jour de passage à l'heure d'hiver", () => {
    const r = parisPeriodRange("2026-10-25", "2026-10-25");
    expect(r).not.toBeNull();
    expect((r as { start: number; end: number }).end - (r as { start: number }).start).toBe(
      25 * 3_600_000,
    );
  });

  it("inclut le dernier jour saisi en entier", () => {
    const r = parisPeriodRange("2026-09-01", "2026-09-01");
    expect(r?.start).toBe(SEPT_1);
    expect((r as { end: number }).end - SEPT_1).toBe(86_400_000);
  });

  it("refuse une date illisible ou une période inversée plutôt que de rendre une plage vide", () => {
    expect(parisPeriodRange("", "2026-09-30")).toBeNull();
    expect(parisPeriodRange("01/09/2026", "2026-09-30")).toBeNull();
    expect(parisPeriodRange("2026-02-30", "2026-09-30")).toBeNull();
    expect(parisPeriodRange("2026-09-30", "2026-09-01")).toBeNull();
  });
});

describe("conséquence sur la déclaration", () => {
  /** Commande réduite au seul champ que `inRange` regarde. */
  const cmd = (iso: string) => ({ createdAt: new Date(iso).getTime() }) as Order;

  it("laisse le service du soir du 31 août dans la période d'août", () => {
    const soir31Aout = cmd("2026-08-31T20:00:00.000Z"); // 22:00 à Paris
    const matin1erSept = cmd("2026-09-01T07:00:00.000Z"); // 09:00 à Paris
    const liste = [soir31Aout, matin1erSept];

    const septembre = parisPeriodRange("2026-09-01", "2026-09-30");
    const aout = parisPeriodRange("2026-08-01", "2026-08-31");

    expect(inRange(liste, septembre!.start, septembre!.end)).toEqual([matin1erSept]);
    expect(inRange(liste, aout!.start, aout!.end)).toEqual([soir31Aout]);
  });

  it("ne compte aucune commande deux fois sur deux mois consécutifs", () => {
    const liste = [
      cmd("2026-08-31T21:59:00.000Z"),
      cmd("2026-08-31T22:00:00.000Z"),
      cmd("2026-09-30T21:59:00.000Z"),
      cmd("2026-09-30T22:00:00.000Z"),
    ];
    const aout = parisPeriodRange("2026-08-01", "2026-08-31")!;
    const septembre = parisPeriodRange("2026-09-01", "2026-09-30")!;
    const octobre = parisPeriodRange("2026-10-01", "2026-10-31")!;

    const compte = (r: { start: number; end: number }) => inRange(liste, r.start, r.end).length;
    expect(compte(aout)).toBe(1);
    expect(compte(septembre)).toBe(2);
    expect(compte(octobre)).toBe(1);
    expect(compte(aout) + compte(septembre) + compte(octobre)).toBe(liste.length);
  });
});
