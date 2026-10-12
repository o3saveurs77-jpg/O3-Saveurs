import { describe, it, expect } from "vitest";
import {
  ORDRE_SEMAINE,
  aEnvoyer,
  appliquerATouteLaSemaine,
  erreurJour,
  trierSemaine,
} from "@/components/admin/HorairesAdmin";
import { DEFAULT_HOURS, type DayHours } from "@/lib/hours";

/* Les règles de l'éditeur d'horaires, isolées du rendu.
 *
 * Elles doublent celles du `PUT /api/hours` : une saisie incohérente qui
 * passerait ici casserait la prise de commande (créneaux du midi proposés un
 * jour fermé le midi, service annoncé ouvert sans aucun créneau). Le serveur
 * reste l'autorité — ces fonctions ne font qu'éviter l'aller-retour et montrer
 * l'erreur sur la bonne ligne.
 */

const jour = (patch: Partial<DayHours> = {}): DayHours => ({
  weekday: 3,
  closed: false,
  lunchOpen: "11:30",
  lunchClose: "14:30",
  dinnerOpen: "18:00",
  dinnerClose: "22:45",
  ...patch,
});

describe("ordre d'affichage", () => {
  it("commence le lundi et finit le dimanche", () => {
    expect([...ORDRE_SEMAINE]).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(trierSemaine(DEFAULT_HOURS).map((j) => j.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("rend toujours sept lignes, même si la base en renvoie moins", () => {
    const partiel = DEFAULT_HOURS.filter((j) => j.weekday === 1 || j.weekday === 5);
    expect(trierSemaine(partiel)).toHaveLength(7);
  });
});

describe("erreurJour", () => {
  it("accepte les horaires de référence du restaurant", () => {
    for (const j of DEFAULT_HOURS) expect(erreurJour(j)).toBeNull();
  });

  it("accepte un jour fermé le midi, service du soir seul", () => {
    expect(erreurJour(jour({ lunchOpen: null, lunchClose: null }))).toBeNull();
  });

  it("refuse une fermeture antérieure à son ouverture", () => {
    expect(erreurJour(jour({ lunchClose: "11:00" }))).toMatch(/après l'ouverture/);
    expect(erreurJour(jour({ dinnerOpen: "23:00", dinnerClose: "22:45" }))).toMatch(
      /après l'ouverture/,
    );
  });

  it("refuse une fermeture égale à son ouverture : un service de zéro minute", () => {
    expect(erreurJour(jour({ lunchOpen: "12:00", lunchClose: "12:00" }))).not.toBeNull();
  });

  it("refuse un service à moitié rempli", () => {
    const incomplet = /une heure d'ouverture et d'une heure de fermeture/;
    expect(erreurJour(jour({ lunchClose: null }))).toMatch(incomplet);
    expect(erreurJour(jour({ lunchOpen: null }))).toMatch(incomplet);
    expect(erreurJour(jour({ dinnerClose: null }))).toMatch(/soir/);
  });

  it("refuse un soir qui commence avant la fin du midi", () => {
    expect(erreurJour(jour({ lunchClose: "15:00", dinnerOpen: "14:00" }))).toMatch(
      /avant la fin du midi/,
    );
  });

  it("refuse un jour ouvert sans aucun service : « ouvert » sans créneau commandable", () => {
    const vide = jour({ lunchOpen: null, lunchClose: null, dinnerOpen: null, dinnerClose: null });
    expect(erreurJour(vide)).toMatch(/Aucun service/);
  });

  it("ignore les horaires d'un jour fermé, même incohérents", () => {
    expect(erreurJour(jour({ closed: true, lunchOpen: "14:00", lunchClose: "11:00" }))).toBeNull();
    const vide = jour({
      closed: true,
      lunchOpen: null,
      lunchClose: null,
      dinnerOpen: null,
      dinnerClose: null,
    });
    expect(erreurJour(vide)).toBeNull();
  });
});

describe("aEnvoyer", () => {
  it("vide les horaires d'un jour fermé", () => {
    expect(aEnvoyer(jour({ closed: true }))).toEqual({
      weekday: 3,
      closed: true,
      lunchOpen: null,
      lunchClose: null,
      dinnerOpen: null,
      dinnerClose: null,
    });
  });

  it("laisse un jour ouvert intact", () => {
    const ouvert = jour();
    expect(aEnvoyer(ouvert)).toEqual(ouvert);
  });
});

describe("appliquerATouteLaSemaine", () => {
  it("recopie la ligne sur les sept jours sans écraser les `weekday`", () => {
    const semaine = appliquerATouteLaSemaine(DEFAULT_HOURS, 1);
    expect(semaine.map((j) => j.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const j of semaine) {
      expect(j.lunchOpen).toBe("11:30");
      expect(j.dinnerClose).toBe("22:45");
    }
  });

  it("propage aussi la fermeture", () => {
    const semaine = appliquerATouteLaSemaine(
      DEFAULT_HOURS.map((j) => (j.weekday === 2 ? { ...j, closed: true } : j)),
      2,
    );
    expect(semaine.every((j) => j.closed)).toBe(true);
  });

  it("ne touche à rien si le jour modèle est absent", () => {
    const partiel = DEFAULT_HOURS.filter((j) => j.weekday !== 4);
    expect(appliquerATouteLaSemaine(partiel, 4)).toEqual(partiel);
  });
});
