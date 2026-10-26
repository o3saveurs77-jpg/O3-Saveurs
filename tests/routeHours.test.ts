import { describe, it, expect, vi, beforeEach } from "vitest";

/* `PUT /api/hours` — horaires d'ouverture.
 *
 * Ce qu'on protège : les horaires ne sont plus décoratifs. Depuis le lot 4.5,
 * `isOpenAt()` et `availableSlots()` les lisent pour décider si une commande est
 * acceptée et quels créneaux sont proposés. Une saisie incohérente ne casse donc
 * pas un affichage, elle casse la prise de commande : un service du midi annoncé
 * un jour où la cuisine est fermée fait accepter des commandes que personne ne
 * préparera, et un jour « ouvert sans aucun service » affiche « ouvert » sans
 * qu'un seul créneau soit proposable.
 *
 * `tests/horairesAdmin.test.ts` couvre déjà les mêmes règles **côté écran**. Le
 * serveur reste l'autorité : l'écran ne fait qu'éviter l'aller-retour, et il
 * suffit d'un appel direct pour le contourner. Ce fichier éprouve le serveur.
 *
 * ⚠️ `.env` pointe sur la base de production : Prisma est neutralisé.
 */

vi.mock("@/auth", async () => {
  const m = await import("./aide/adminSession");
  return { auth: m.authSimulee };
});

vi.mock("@/lib/prisma", async () => {
  const m = await import("./aide/adminPrisma");
  return { prisma: m.prismaDouble.client };
});

import { GET, PUT } from "@/app/api/hours/route";
import { WEEKDAY_LABEL, type DayHours } from "@/lib/hours";
import { commeAdmin, commeClient, commeLivreur, sansSession } from "./aide/adminSession";
import { prismaDouble } from "./aide/adminPrisma";
import { appeler, requete, requeteCorpsCasse, lire } from "./aide/adminRequete";

const URL_HOURS = "http://localhost/api/hours";

/** Mercredi « normal » du restaurant : midi + soir. */
function jour(patch: Partial<Record<keyof DayHours, unknown>> = {}): Record<string, unknown> {
  return {
    weekday: 3,
    closed: false,
    lunchOpen: "11:30",
    lunchClose: "14:30",
    dinnerOpen: "18:00",
    dinnerClose: "22:45",
    ...patch,
  };
}

async function put(corps: unknown) {
  prismaDouble.reinitialiser();
  commeAdmin();
  return appeler(PUT, requete("PUT", URL_HOURS, corps));
}

/** Lignes réellement envoyées à `openingHours.upsert`. */
function upserts(): { weekday: number; create: Record<string, unknown>; update: Record<string, unknown> }[] {
  return prismaDouble.ecritures().map((a) => {
    const arg = a.args[0] as {
      where: { weekday: number };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    return { weekday: arg.where.weekday, create: arg.create, update: arg.update };
  });
}

beforeEach(() => {
  prismaDouble.reinitialiser();
  sansSession();
});

// ─── Garde ─────────────────────────────────────────────

/* `GET` est une information de vitrine (pied de page, page Contact). `PUT`
 * change les heures auxquelles le restaurant accepte de l'argent. */
describe("garde de /api/hours", () => {
  it("GET est public", async () => {
    sansSession();
    const r = await appeler(GET, requete("GET", URL_HOURS));
    expect(r.status).toBe(200);
  });

  it("PUT refuse un appelant anonyme par 401, sans rien écrire", async () => {
    sansSession();
    const r = await appeler(PUT, requete("PUT", URL_HOURS, { days: [jour()] }));
    expect(r.status).toBe(401);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("PUT refuse un CLIENT et un LIVREUR par 403", async () => {
    commeClient();
    expect((await appeler(PUT, requete("PUT", URL_HOURS, { days: [jour()] }))).status).toBe(403);
    prismaDouble.reinitialiser();
    commeLivreur();
    expect((await appeler(PUT, requete("PUT", URL_HOURS, { days: [jour()] }))).status).toBe(403);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });
});

// ─── Forme du corps ────────────────────────────────────

describe("forme du corps", () => {
  it("refuse un JSON malformé sans tomber en 500", async () => {
    prismaDouble.reinitialiser();
    commeAdmin();
    const r = await lire(await PUT(requeteCorpsCasse("PUT", URL_HOURS)));
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un corps qui ne décrit aucun jour", async () => {
    expect((await put({})).corps.error).toBe("Aucun jour fourni");
    expect((await put({ days: [] })).corps.error).toBe("Aucun jour fourni");
    expect((await put({ days: "lundi" })).corps.error).toBe("Aucun jour fourni");
  });

  it("accepte un jour unique passé sans enveloppe `days`", async () => {
    const r = await put(jour({ weekday: 5, lunchOpen: null, lunchClose: null }));
    expect(r.status).toBe(200);
    expect(upserts()).toHaveLength(1);
    expect(upserts()[0].weekday).toBe(5);
  });

  it("refuse plus de sept jours", async () => {
    const huit = [0, 1, 2, 3, 4, 5, 6, 0].map((w) => jour({ weekday: w }));
    expect((await put({ days: huit })).corps.error).toBe("La semaine ne compte que 7 jours");
  });

  it("refuse un jour fourni deux fois — on ne saurait pas lequel garde la main", async () => {
    const r = await put({ days: [jour(), jour({ lunchOpen: "12:00" })] });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("fourni deux fois");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un numéro de jour hors de la semaine ou non entier", async () => {
    for (const w of [7, -1, 1.5, "mercredi", null]) {
      const r = await put({ days: [jour({ weekday: w })] });
      expect(r.status, `weekday ${String(w)}`).toBe(400);
    }
  });

  it("accepte les sept jours d'un coup et les écrit tous", async () => {
    const semaine = [1, 2, 3, 4, 5, 6, 0].map((w) => jour({ weekday: w }));
    const r = await put({ days: semaine });
    expect(r.status).toBe(200);
    expect(upserts().map((u) => u.weekday).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

// ─── Cohérence d'un service ────────────────────────────

/* Une fermeture antérieure à l'ouverture produit un service de durée négative :
 * `availableSlots()` n'en proposerait aucun créneau, et le pied de page
 * annoncerait « 14h30 – 11h30 ». */
describe("fermeture avant ouverture", () => {
  it("refuse un midi qui ferme avant d'ouvrir", async () => {
    const r = await put({ days: [jour({ lunchClose: "10:00" })] });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("doit être après l'ouverture");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse un soir qui ferme avant d'ouvrir", async () => {
    const r = await put({ days: [jour({ dinnerOpen: "22:00", dinnerClose: "19:00" })] });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("soir");
  });

  // Durée nulle : un service qui ouvre et ferme à la même minute ne sert rien.
  it("refuse un service de durée nulle", async () => {
    const r = await put({ days: [jour({ lunchClose: "11:30" })] });
    expect(r.status).toBe(400);
  });

  /* Un service du soir qui commencerait avant la fin du midi ferait coexister
   * deux services ouverts : les créneaux seraient comptés deux fois. */
  it("refuse un soir qui commence avant la fin du midi", async () => {
    const r = await put({ days: [jour({ dinnerOpen: "13:00" })] });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("commence avant la fin du midi");
  });

  it("accepte un service du soir qui enchaîne exactement sur la fin du midi", async () => {
    const r = await put({ days: [jour({ dinnerOpen: "14:30" })] });
    expect(r.status).toBe(200);
    expect(upserts()[0].create).toMatchObject({ lunchClose: "14:30", dinnerOpen: "14:30" });
  });

  it("refuse une heure qui n'est pas au format HH:MM", async () => {
    for (const h of ["11h30", "24:00", "7:5", "11:60", "onze heures", 1130]) {
      const r = await put({ days: [jour({ lunchOpen: h })] });
      expect(r.status, `heure ${String(h)}`).toBe(400);
      expect(r.corps.error).toContain("HH:MM");
    }
  });
});

/* Un service à moitié rempli est l'erreur de saisie la plus courante : on tape
 * l'ouverture, on oublie la fermeture. L'accepter laisserait en base un service
 * sans fin, que `servicesOf()` ne saurait pas borner. */
describe("service à moitié rempli", () => {
  it("refuse une ouverture sans fermeture", async () => {
    const r = await put({ days: [jour({ lunchClose: "" })] });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("ou d'aucune des deux");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("refuse une fermeture sans ouverture", async () => {
    const r = await put({ days: [jour({ dinnerOpen: null })] });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain("soir");
  });

  /* `""`, `null` et l'absence valent tous « pas de service » : c'est ce qui
   * permet d'exprimer le vendredi et le dimanche, fermés le midi seulement,
   * sans marquer le jour entier comme fermé. */
  it("accepte un service entièrement absent, sous ses trois formes", async () => {
    for (const vide of [
      { lunchOpen: "", lunchClose: "" },
      { lunchOpen: null, lunchClose: null },
      { lunchOpen: undefined, lunchClose: undefined },
    ]) {
      const r = await put({ days: [jour({ weekday: 5, ...vide })] });
      expect(r.status).toBe(200);
      expect(upserts()[0].create).toMatchObject({
        closed: false,
        lunchOpen: null,
        lunchClose: null,
        dinnerOpen: "18:00",
      });
    }
  });
});

/* « Fermé » veut dire : aucun service. Conserver les horaires d'un jour fermé
 * laisserait en base des heures qu'aucun calcul ne lit (`servicesOf()` s'arrête
 * à `closed`) mais qu'un écran pourrait réafficher comme si le service avait
 * lieu — et le jour d'après, décocher « fermé » rouvrirait des horaires que
 * personne n'a revalidés. */
describe("jour marqué fermé", () => {
  it("vide les quatre horaires, même si le corps en envoie", async () => {
    const r = await put({ days: [jour({ closed: true })] });
    expect(r.status).toBe(200);
    const [u] = upserts();
    expect(u.create).toEqual({
      weekday: 3,
      closed: true,
      lunchOpen: null,
      lunchClose: null,
      dinnerOpen: null,
      dinnerClose: null,
    });
    expect(u.update).toEqual({
      closed: true,
      lunchOpen: null,
      lunchClose: null,
      dinnerOpen: null,
      dinnerClose: null,
    });
  });

  /* Un jour fermé ne valide pas ses horaires : refuser une fermeture à cause
   * d'un champ resté à moitié rempli avant qu'on coche « fermé » serait une
   * impasse dans l'écran d'administration. */
  it("accepte une fermeture même avec des horaires incohérents en reste", async () => {
    const r = await put({
      days: [jour({ closed: true, lunchOpen: "14:30", lunchClose: "11:30", dinnerOpen: "n'importe quoi" })],
    });
    expect(r.status).toBe(200);
    expect(upserts()[0].create).toMatchObject({ closed: true, lunchOpen: null, dinnerOpen: null });
  });

  it("ne tient pour fermé que ce qui l'est explicitement", async () => {
    // `bool()` ne prend pour vrai que `true`, `"true"`, `1` et `"1"`.
    const r = await put({ days: [jour({ closed: "peut-être" })] });
    expect(r.status).toBe(200);
    expect(upserts()[0].create).toMatchObject({ closed: false, lunchOpen: "11:30" });
  });

  it("accepte « fermé » exprimé en chaîne, comme l'envoient les formulaires", async () => {
    const r = await put({ days: [jour({ closed: "true" })] });
    expect(r.status).toBe(200);
    expect(upserts()[0].create).toMatchObject({ closed: true, lunchOpen: null });
  });
});

/* Un jour ouvert sans aucun service est un piège : le client lit « ouvert » et
 * ne trouve aucun créneau. C'est l'état que produit un décochage de « fermé »
 * sans ressaisie des heures. */
describe("jour ouvert sans aucun service", () => {
  it("est refusé, avec le nom du jour dans le message", async () => {
    const r = await put({
      days: [
        jour({
          weekday: 2,
          lunchOpen: null,
          lunchClose: null,
          dinnerOpen: null,
          dinnerClose: null,
        }),
      ],
    });
    expect(r.status).toBe(400);
    expect(r.corps.error).toContain(WEEKDAY_LABEL[2]);
    expect(r.corps.error).toContain("fermé");
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("est refusé aussi quand il accompagne des jours valides — rien n'est écrit", async () => {
    const r = await put({
      days: [
        jour({ weekday: 1 }),
        jour({ weekday: 2, lunchOpen: null, lunchClose: null, dinnerOpen: null, dinnerClose: null }),
      ],
    });
    expect(r.status).toBe(400);
    expect(prismaDouble.ecritures()).toHaveLength(0);
  });

  it("accepte un jour qui n'a qu'un seul des deux services", async () => {
    const midiSeul = await put({ days: [jour({ dinnerOpen: null, dinnerClose: null })] });
    expect(midiSeul.status).toBe(200);
    const soirSeul = await put({ days: [jour({ lunchOpen: null, lunchClose: null })] });
    expect(soirSeul.status).toBe(200);
    expect(upserts()[0].create).toMatchObject({ lunchOpen: null, dinnerOpen: "18:00" });
  });
});

// ─── Réponse ───────────────────────────────────────────

/* La réponse sert directement au pied de page et à l'écran d'administration :
 * elle doit porter les sept jours et l'état courant, sinon l'écran réclame un
 * second appel et affiche un état incohérent entre-temps. */
describe("réponse de la route", () => {
  it("renvoie les sept jours, l'heure de Paris et la configuration des créneaux", async () => {
    const r = await put({ days: [jour()] });
    const corps = r.corps as unknown as {
      hours: DayHours[];
      now: { weekday: number; weekdayLabel: string; time: string };
      open: boolean;
      slots: unknown[];
      slotConfig: { stepMinutes: number; leadTimeMinutes: number };
    };
    expect(corps.hours).toHaveLength(7);
    expect(corps.hours.map((h) => h.weekday).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(corps.now.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(corps.now.weekdayLabel).toBe(WEEKDAY_LABEL[corps.now.weekday]);
    expect(typeof corps.open).toBe("boolean");
    expect(Array.isArray(corps.slots)).toBe(true);
    expect(corps.slotConfig).toEqual({ stepMinutes: 30, leadTimeMinutes: 35 });
  });

  it("GET répond la même forme que PUT", async () => {
    sansSession();
    const r = await appeler<{ hours: DayHours[]; slotConfig: unknown; next: unknown }>(
      GET,
      requete("GET", URL_HOURS),
    );
    expect(r.corps.hours).toHaveLength(7);
    expect(r.corps.slotConfig).toBeDefined();
    expect(r.corps).toHaveProperty("next");
  });

  /* Une écriture par jour fourni, et une seule transaction : enregistrer les
   * sept jours en sept allers-retours laisserait une semaine à moitié écrite si
   * le quatrième échouait. */
  it("écrit dans une seule transaction", async () => {
    await put({ days: [jour({ weekday: 1 }), jour({ weekday: 2 })] });
    expect(prismaDouble.journal.filter((a) => a.cible === "$transaction")).toHaveLength(1);
    expect(upserts()).toHaveLength(2);
  });
});
