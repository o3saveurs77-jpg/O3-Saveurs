// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HorairesAdmin } from "@/components/admin/HorairesAdmin";
import { DEFAULT_HOURS, type DayHours } from "@/lib/hours";

/**
 * L'écran des horaires, rendu pour de vrai.
 *
 * `tests/horairesAdmin.test.ts` éprouve déjà les règles pures (`erreurJour`,
 * `trierSemaine`, `aEnvoyer`). Il reste que **cet écran n'a jamais été
 * ouvert** : il est derrière Auth0, et son seul moyen d'exister est ce fichier.
 * Or c'est lui qui décide du refus des commandes hors service, des créneaux
 * proposés au client : une fermeture
 * exceptionnelle mal enregistrée, et le site encaisse pour un service qui
 * n'aura pas lieu.
 *
 * On éprouve donc ce que voit la cliente : l'ordre des jours, l'effet de la
 * case « Fermé » sur la saisie, le refus affiché **sur la bonne ligne**, et ce
 * que l'écran fait quand le réseau tombe — au chargement comme à
 * l'enregistrement.
 */

/* ─── Le serveur, tel que l'écran l'attend ──────────────────────────────── */

const semaineOuverte = (): DayHours[] => DEFAULT_HOURS.map((j) => ({ ...j }));

function etat(hours: DayHours[] = semaineOuverte()) {
  return {
    hours,
    now: { weekday: 2, weekdayLabel: "Mardi", time: "12:30" },
    open: true,
    next: null,
    slots: ["12:30", "12:45"],
  };
}

type Reponse = { statut?: number; corps: unknown };

/** File de réponses, consommée dans l'ordre : une par appel à `fetch`. */
let reponses: Reponse[];
let appels: { url: string; methode: string; corps: unknown }[];

function fetchFactice() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const methode = init?.method ?? "GET";
    appels.push({
      url: String(url),
      methode,
      corps: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const r = reponses.shift() ?? { corps: etat() };
    const statut = r.statut ?? 200;
    return {
      ok: statut >= 200 && statut < 300,
      status: statut,
      json: async () => r.corps,
    } as unknown as Response;
  });
}

beforeEach(() => {
  reponses = [];
  appels = [];
  vi.stubGlobal("fetch", fetchFactice());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Rend l'écran et attend la fin du chargement initial. */
async function ouvrir(premiere: Reponse = { corps: etat() }) {
  reponses.push(premiere);
  const vue = render(<HorairesAdmin />);
  await waitFor(() => expect(appels.length).toBeGreaterThan(0));
  return vue;
}

/** Les quatre champs heure d'un jour, par leur identifiant stable. */
function champs(weekday: number) {
  const q = (suffixe: string) =>
    document.getElementById(`horaires-${weekday}-${suffixe}`) as HTMLInputElement;
  return {
    midiOuverture: q("lunch-open"),
    midiFermeture: q("lunch-close"),
    soirOuverture: q("dinner-open"),
    soirFermeture: q("dinner-close"),
    ferme: q("closed"),
  };
}

const saisir = (champ: HTMLInputElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });

const boutonEnregistrer = () => screen.getByRole("button", { name: /Enregistrer les horaires/ });

/* ─── L'ordre des jours ─────────────────────────────────────────────────── */

/* La semaine d'un restaurateur commence le lundi. La base, elle, numérote
 * dimanche = 0 : si cet ordre remontait jusqu'à l'écran, la cliente saisirait
 * ses horaires du lundi sur la ligne du dimanche sans s'en apercevoir. */
describe("les sept jours de la semaine", () => {
  it("s'affichent du lundi au dimanche, et pas dans l'ordre de la base", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    const ordre = [...document.querySelectorAll<HTMLInputElement>('input[type="time"]')]
      .map((i) => Number(i.id.split("-")[1]))
      .filter((wd, k, tous) => tous.indexOf(wd) === k);

    expect(ordre).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("affichent chacun leur nom, les sept, même si la base en renvoie moins", async () => {
    // Trois jours seulement : les quatre autres doivent quand même apparaître,
    // sinon ils resteraient inéditables pour toujours.
    await ouvrir({ corps: etat(semaineOuverte().filter((j) => [1, 3, 0].includes(j.weekday))) });
    await screen.findByText("Lundi");

    for (const nom of ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]) {
      expect(screen.getAllByText(nom).length).toBeGreaterThan(0);
    }
    expect(document.querySelectorAll('input[type="time"]')).toHaveLength(28);
  });
});

/* ─── La case « Fermé » ─────────────────────────────────────────────────── */

/* Un jour fermé ignore ses horaires (`aEnvoyer` les met à `null` à l'envoi).
 * Mais les effacer *dans le formulaire* serait une perte sèche : une fermeture
 * exceptionnelle qu'on coche par erreur, ou qu'on décoche après l'avoir levée,
 * obligerait à ressaisir les quatre heures de la journée. */
describe("cocher « Fermé »", () => {
  it("désactive les quatre champs du jour, et eux seuls", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    fireEvent.click(champs(1).ferme);

    const lundi = champs(1);
    expect(lundi.midiOuverture).toBeDisabled();
    expect(lundi.midiFermeture).toBeDisabled();
    expect(lundi.soirOuverture).toBeDisabled();
    expect(lundi.soirFermeture).toBeDisabled();
    // Le mardi n'a aucune raison de se fermer avec lui.
    expect(champs(2).midiOuverture).toBeEnabled();
  });

  it("conserve ce qui était saisi : décocher le restitue au lieu de le perdre", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(1).midiOuverture, "10:15");
    saisir(champs(1).soirFermeture, "23:30");

    fireEvent.click(champs(1).ferme);
    expect(champs(1).ferme).toBeChecked();
    fireEvent.click(champs(1).ferme);

    expect(champs(1).ferme).not.toBeChecked();
    expect(champs(1).midiOuverture.value).toBe("10:15");
    expect(champs(1).soirFermeture.value).toBe("23:30");
    expect(champs(1).midiOuverture).toBeEnabled();
  });

  it("n'envoie aucun horaire pour un jour fermé, et ferme bien ce jour-là", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    fireEvent.click(champs(1).ferme);
    reponses.push({ corps: etat() });
    fireEvent.click(boutonEnregistrer());

    await waitFor(() => expect(appels.some((a) => a.methode === "PUT")).toBe(true));
    const envoi = appels.find((a) => a.methode === "PUT")!.corps as { days: DayHours[] };
    const lundi = envoi.days.find((j) => j.weekday === 1)!;

    expect(lundi.closed).toBe(true);
    expect(lundi.lunchOpen).toBeNull();
    expect(lundi.lunchClose).toBeNull();
    expect(lundi.dinnerOpen).toBeNull();
    expect(lundi.dinnerClose).toBeNull();
    // L'ordre du corps est celui de l'affichage : lundi d'abord.
    expect(envoi.days.map((j) => j.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

/* ─── Les saisies incohérentes ──────────────────────────────────────────── */

/* Une fermeture avant son ouverture donne un service de durée négative :
 * `servicesOf()` ne proposerait aucun créneau, et le site annoncerait
 * « ouvert » sans rien à commander. Le refus doit se lire **sur la ligne
 * fautive** : un message en pied de page sur une grille de sept jours ne dit
 * pas lequel corriger. */
describe("une fermeture placée avant son ouverture", () => {
  it("est refusée par un message qui nomme les deux heures, sur la ligne du jour", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(1).midiOuverture, "14:00");
    saisir(champs(1).midiFermeture, "12:00");

    const erreur = await screen.findByText(
      "La fermeture du midi (12:00) doit être après l'ouverture (14:00).",
    );
    // L'identifiant porte le jour : c'est ce qui rattache le message à sa ligne.
    expect(erreur).toHaveAttribute("id", "horaires-1-erreur");
    expect(champs(1).midiFermeture).toHaveAttribute("aria-describedby", "horaires-1-erreur");
    expect(champs(1).midiFermeture).toHaveAttribute("aria-invalid", "true");
    // Les autres jours restent indemnes.
    expect(champs(2).midiFermeture).toHaveAttribute("aria-invalid", "false");
  });

  it("refuse aussi deux heures identiques — un service de durée nulle", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(3).soirOuverture, "19:00");
    saisir(champs(3).soirFermeture, "19:00");

    expect(
      await screen.findByText("La fermeture du soir (19:00) doit être après l'ouverture (19:00)."),
    ).toBeInTheDocument();
  });

  it("bloque l'enregistrement et nomme le jour, sans appeler le serveur", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(5).soirOuverture, "22:00");
    saisir(champs(5).soirFermeture, "18:00");
    fireEvent.click(boutonEnregistrer());

    const avis = await screen.findByRole("status");
    expect(avis).toHaveTextContent(/^Vendredi —/);
    expect(appels.filter((a) => a.methode === "PUT")).toHaveLength(0);
  });
});

/* Un service à moitié rempli est le pire des cas : `servicesOf()` le laisse
 * tomber en silence, la cliente croit avoir ouvert le midi, et les clients ne
 * voient aucun créneau. Rien à l'écran ne le signalait. */
describe("un service à moitié rempli", () => {
  it("est refusé : une ouverture sans fermeture n'ouvre rien du tout", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(1).midiFermeture, "");

    expect(
      await screen.findByText(
        "Le midi a besoin d'une heure d'ouverture et d'une heure de fermeture, ou d'aucune des deux.",
      ),
    ).toBeInTheDocument();
    expect(champs(1).midiOuverture).toHaveAttribute("aria-invalid", "true");
  });

  it("est refusé dans l'autre sens aussi : une fermeture sans ouverture", async () => {
    // Le vendredi est fermé le midi par défaut : on ne remplit que la fermeture.
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(5).midiFermeture, "14:30");

    expect(
      await screen.findByText(
        "Le midi a besoin d'une heure d'ouverture et d'une heure de fermeture, ou d'aucune des deux.",
      ),
    ).toBeInTheDocument();
  });

  it("accepte en revanche les deux champs vides — c'est ainsi qu'on dit « fermé le midi »", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(1).midiOuverture, "");
    saisir(champs(1).midiFermeture, "");

    expect(champs(1).midiOuverture).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/a besoin d'une heure d'ouverture/)).not.toBeInTheDocument();
  });

  it("refuse un jour ouvert sans aucun service : le site l'annoncerait ouvert pour rien", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    for (const champ of ["midiOuverture", "midiFermeture", "soirOuverture", "soirFermeture"] as const) {
      saisir(champs(4)[champ], "");
    }

    expect(
      await screen.findByText(
        "Aucun service renseigné : cochez « Fermé », ou donnez les heures du midi ou du soir.",
      ),
    ).toBeInTheDocument();
  });
});

/* ─── « Appliquer à toute la semaine » ──────────────────────────────────── */

/* Du lundi au samedi les horaires sont identiques dans la réalité : les saisir
 * sept fois est précisément la raison pour laquelle personne ne les tenait à
 * jour. Le raccourci doit donc recopier la ligne — sans pour autant défaire
 * une fermeture déjà décidée. */
describe("« Appliquer à toute la semaine »", () => {
  /** Le bouton du jour demandé, dans l'ordre d'affichage lundi → dimanche. */
  const bouton = (weekday: number) => {
    const ordre = [1, 2, 3, 4, 5, 6, 0];
    return screen.getAllByRole("button", { name: /Appliquer à toute la semaine/ })[
      ordre.indexOf(weekday)
    ];
  };

  it("recopie les quatre heures de la ligne sur les sept jours", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(1).midiOuverture, "10:00");
    saisir(champs(1).midiFermeture, "15:00");
    saisir(champs(1).soirOuverture, "19:00");
    saisir(champs(1).soirFermeture, "23:00");

    fireEvent.click(bouton(1));

    for (const wd of [1, 2, 3, 4, 5, 6, 0]) {
      expect(champs(wd).midiOuverture.value).toBe("10:00");
      expect(champs(wd).midiFermeture.value).toBe("15:00");
      expect(champs(wd).soirOuverture.value).toBe("19:00");
      expect(champs(wd).soirFermeture.value).toBe("23:00");
    }
  });

  it("ne renumérote pas les jours au passage", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(6).midiOuverture, "09:30");
    fireEvent.click(bouton(6));

    const ordre = [...document.querySelectorAll<HTMLInputElement>('input[type="time"]')]
      .map((i) => Number(i.id.split("-")[1]))
      .filter((wd, k, tous) => tous.indexOf(wd) === k);
    expect(ordre).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  /* DÉFAUT — `appliquerATouteLaSemaine` recopie aussi le `closed` du modèle.
   * Appliquer un lundi ouvert à toute la semaine **rouvre** le dimanche que la
   * cliente vient de fermer, et l'écran n'en dit rien : l'enregistrement part
   * avec un jour ouvert qui ne devait pas l'être, le site accepte des commandes
   * pour un service qui n'aura pas lieu. Le geste est pourtant celui qu'on
   * attend en fin de saisie — « mes horaires sont les mêmes partout » ne veut
   * jamais dire « et j'ouvre le dimanche ».
   *
   * Le comportement actuel est même figé par `tests/horairesAdmin.test.ts`
   * (« propage aussi la fermeture ») : la correction demande donc un arbitrage,
   * pas seulement un patch. */
  it.fails("laisse fermé un jour marqué fermé, au lieu de le rouvrir", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    fireEvent.click(champs(0).ferme); // dimanche : fermeture décidée
    expect(champs(0).ferme).toBeChecked();

    saisir(champs(1).midiOuverture, "11:00");
    fireEvent.click(bouton(1));

    expect(champs(0).ferme).toBeChecked();
  });

  /* Revers de la même pièce : appliquer depuis un jour fermé ferme la semaine
   * entière. Ce test documente l'état réel, pour qu'une correction du défaut
   * ci-dessus ne passe pas à côté. */
  it("ferme en revanche toute la semaine si le jour modèle est fermé (état actuel)", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    fireEvent.click(champs(1).ferme);
    fireEvent.click(bouton(1));

    for (const wd of [1, 2, 3, 4, 5, 6, 0]) expect(champs(wd).ferme).toBeChecked();
  });
});

/* ─── Ce que dit l'écran quand le serveur refuse ────────────────────────── */

/* Le `PUT /api/hours` refuse avec une phrase précise (« Le soir commence avant
 * la fin du midi », « weekday hors bornes »…). La remplacer par un
 * « Enregistrement impossible » générique ferait chercher la cliente au mauvais
 * endroit — ou nous appeler, ce que cet écran existe précisément pour éviter. */
describe("quand le serveur refuse l'enregistrement", () => {
  it("affiche le message du serveur, pas un texte générique", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    reponses.push({
      statut: 400,
      corps: { error: "Jeudi : la fermeture du soir dépasse minuit." },
    });
    fireEvent.click(boutonEnregistrer());

    expect(
      await screen.findByText("Jeudi : la fermeture du soir dépasse minuit."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Enregistrement impossible.")).not.toBeInTheDocument();
  });

  it("retombe sur un message lisible quand le serveur n'en donne aucun", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    reponses.push({ statut: 500, corps: null });
    fireEvent.click(boutonEnregistrer());

    expect(await screen.findByText("Enregistrement impossible.")).toBeInTheDocument();
  });

  it("dit que rien n'a été enregistré quand le réseau tombe", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(boutonEnregistrer());

    expect(
      await screen.findByText("Réseau indisponible — horaires non enregistrés."),
    ).toBeInTheDocument();
    // Le formulaire reste là, avec la saisie : rien ne doit être perdu.
    expect(champs(1).midiOuverture).toBeInTheDocument();
  });

  it("réaffiche ce que le serveur a réellement écrit après un succès", async () => {
    await ouvrir();
    await screen.findByText("Lundi");

    saisir(champs(1).midiOuverture, "10:00");
    // Le serveur normalise : il renvoie 11:00, c'est lui qui a raison.
    reponses.push({
      corps: etat(semaineOuverte().map((j) => (j.weekday === 1 ? { ...j, lunchOpen: "11:00" } : j))),
    });
    fireEvent.click(boutonEnregistrer());

    await screen.findByText("Horaires enregistrés.");
    expect(champs(1).midiOuverture.value).toBe("11:00");
  });
});

/* ─── Ce que dit l'écran quand le chargement échoue ─────────────────────── */

/* Sans bouton de reprise, une coupure réseau au montage laisse un écran mort :
 * la seule issue est de recharger la page, et rien ne le dit. */
describe("quand le chargement échoue", () => {
  it("montre le message du serveur et un bouton « Réessayer », pas la grille", async () => {
    await ouvrir({ statut: 503, corps: { error: "Base de données indisponible." } });

    expect(await screen.findByText("Base de données indisponible.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
    // Surtout pas une semaine vide qu'on pourrait croire enregistrable.
    expect(screen.queryByRole("button", { name: /Enregistrer les horaires/ })).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[type="time"]')).toHaveLength(0);
  });

  it("relance réellement l'appel et affiche la grille au second essai", async () => {
    await ouvrir({ statut: 500, corps: null });
    await screen.findByText("Les horaires n'ont pas pu être chargés.");

    reponses.push({ corps: etat() });
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

    await screen.findByText("Lundi");
    expect(appels.filter((a) => a.url.includes("/api/hours") && a.methode === "GET")).toHaveLength(2);
    expect(boutonEnregistrer()).toBeInTheDocument();
  });

  it("survit à un corps de réponse illisible — pas d'écran blanc", async () => {
    reponses.push({ corps: undefined });
    render(<HorairesAdmin />);
    // `json()` rend `undefined` : `data?.hours` est absent, donc c'est un échec.
    expect(await screen.findByText("Les horaires n'ont pas pu être chargés.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });

  /* DÉFAUT — `charger()` ne remet pas le message à `null` en cas de succès.
   * Après un « Réessayer » qui aboutit, la cliente garde sous les yeux
   * « Les horaires n'ont pas pu être chargés. » au-dessus d'une grille
   * parfaitement chargée : elle n'a aucun moyen de savoir si ce qu'elle lit est
   * à jour, ni si son enregistrement partira. */
  it.fails("efface le message d'erreur quand le second essai réussit", async () => {
    await ouvrir({ statut: 500, corps: null });
    await screen.findByText("Les horaires n'ont pas pu être chargés.");

    reponses.push({ corps: etat() });
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    await screen.findByText("Lundi");

    expect(
      screen.queryByText("Les horaires n'ont pas pu être chargés."),
    ).not.toBeInTheDocument();
  });

  it("dit « réseau indisponible » quand `fetch` lui-même lève", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<HorairesAdmin />);

    expect(
      await screen.findByText("Réseau indisponible — horaires non chargés."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });
});

/* ─── L'état d'ouverture annoncé ────────────────────────────────────────── */

/* Preuve, pour la cliente, que ces horaires agissent vraiment : l'état calculé
 * par le serveur en heure de Paris. Sans lui, l'écran n'est qu'un formulaire de
 * plus dont rien ne dit s'il a un effet. */
describe("l'état du moment, calculé par le serveur", () => {
  it("annonce la fermeture et le prochain service quand il y en a un", async () => {
    await ouvrir({
      corps: {
        ...etat(),
        open: false,
        next: { weekday: 1, label: "midi" as const, opensAt: "11:30" },
        slots: [],
      },
    });

    const bandeau = await screen.findByText(/Fermé en ce moment/);
    expect(within(bandeau.parentElement as HTMLElement).getByText(/Fermé en ce moment/)).toBeInTheDocument();
    expect(bandeau.parentElement).toHaveTextContent("prochain service : lundi midi, à partir de 11:30.");
  });

  it("prévient quand aucun service n'est à venir : toutes les commandes sont refusées", async () => {
    await ouvrir({ corps: { ...etat(), open: false, next: null, slots: [] } });

    expect(
      await screen.findByText(/aucun service à venir : les commandes sont toutes refusées/),
    ).toBeInTheDocument();
  });

  it("accorde le mot « créneau » au singulier quand il n'en reste qu'un", async () => {
    await ouvrir({ corps: { ...etat(), open: true, slots: ["22:30"] } });

    expect(await screen.findByText(/1 créneau encore commandable/)).toBeInTheDocument();
  });
});
