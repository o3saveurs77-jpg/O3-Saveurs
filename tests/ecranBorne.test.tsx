// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BorneClient } from "@/components/borne/BorneClient";
import {
  BORNE_DONE_MS,
  BORNE_IDLE_MS,
  BORNE_IDLE_WARN_MS,
  BORNE_STORAGE_KEY,
  BORNE_TOKEN_HEADER,
} from "@/lib/borne";
import { BORNE_MAX_QTY } from "@/components/borne/borneCart";
import type { Dish } from "@/lib/menu";
import type { BorneEtat } from "@/app/api/borne/etat/route";
import type { BorneOrderResponse } from "@/app/api/borne/commande/route";

/* `.env` pointe sur la base de **production** et la clé Resend est active : rien
 * de ce qui touche la base ou l'email ne doit pouvoir être atteint depuis un
 * test. `BorneClient` n'en importe aucun aujourd'hui (les types des routes sont
 * effacés à la compilation) ; ces deux neutralisations tiennent la garantie si
 * un import s'ajoutait. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({
  sendMail: vi.fn(async () => ({ ok: false as const, error: "email neutralisé en test" })),
}));

/**
 * La borne de commande en salle, écran par écran.
 *
 * C'est une tablette posée sur un meuble, qui sert vingt clients par service et
 * que personne ne surveille. Elle n'a jamais pris une seule commande : ces
 * tests sont son premier passage. Ce qu'ils protègent :
 *
 *  · **rien ne survit d'un client au suivant** — ni panier, ni prénom, que la
 *    commande aboutisse, que le client s'en aille, ou qu'il reste planté devant
 *    l'écran. C'est l'invariant qui distingue cette tablette du site : le
 *    deuxième client paierait le plat du premier, ou l'inverse ;
 *  · **pas de jeton, pas de commande** — `/borne` est une URL publique. Sans
 *    jeton d'appareil, n'importe quel téléphone enverrait en cuisine des plats
 *    que personne ne viendra chercher ;
 *  · **la tablette ne décide d'aucun montant** — le corps envoyé au serveur ne
 *    porte que des identifiants et des quantités, comme le tunnel web ;
 *  · **un refus se voit, et ne coûte pas le panier** — un plat épuisé entre le
 *    choix et la validation arrive vraiment, en plein service.
 *
 * Le réseau est entièrement simulé : la borne appelle `/api/dishes`,
 * `/api/formules` et `/api/borne/etat` dès le montage.
 */

// ─── Fixtures ──────────────────────────────────────────────────

function plat(over: Partial<Dish> = {}): Dish {
  return {
    id: "d-mafe",
    cat: "africaine",
    name: "Mafé bœuf",
    desc: "Mijoté à la pâte d'arachide",
    priceCents: 1290,
    badge: null,
    photo: null,
    options: [],
    tags: [],
    spice: 0,
    popular: false,
    available: true,
    allergens: [],
    stock: null,
    stockAlert: null,
    costCents: null,
    position: 0,
    leadTimeHours: 0,
    vatRateBp: 1000,
    ...over,
  };
}

const MAFE = plat();
const YASSA = plat({
  id: "d-yassa",
  name: "Yassa poulet",
  priceCents: 1190,
  options: [
    { name: "Accompagnement", required: true, choices: [{ l: "Riz blanc" }, { l: "Attiéké" }] },
  ],
});
const PASTELS = plat({ id: "d-pastels", name: "Pastels poisson", priceCents: 500, stock: 0 });
const TIEP = plat({ id: "d-tiep", name: "Tiep rouge", priceCents: 1390, stock: 2 });
const MASQUE = plat({ id: "d-masque", name: "Thieb blanc", available: false });
const SANS_PRIX = plat({ id: "d-sansprix", name: "Suggestion du jour", priceCents: null });
const GIGOT = plat({
  id: "d-gigot",
  cat: "grillades",
  name: "Gigot d'agneau entier",
  priceCents: 12000,
  leadTimeHours: 48,
});

const CARTE = [MAFE, YASSA, PASTELS, TIEP, MASQUE, SANS_PRIX, GIGOT];

const JETON = "BORNE0123456789AB";

const ETAT_OUVERT: BorneEtat = {
  enabled: true,
  emporter: true,
  open: true,
  nextService: null,
  restaurant: { name: "Ô 3 Saveurs", phone: "01 60 00 00 00" },
};

const CONFIRMATION: BorneOrderResponse = {
  orderId: "cmd_1",
  ref: "OTS-2610-0042",
  ticketNumber: 7,
  ticketDate: "2026-10-13",
  mode: "sur_place",
  customerName: "Awa",
  subtotalCents: 2580,
  discountCents: 0,
  totalCents: 2580,
  lines: [
    {
      dishId: MAFE.id,
      name: MAFE.name,
      photo: null,
      unitPriceCents: 1290,
      qty: 2,
      lineTotalCents: 2580,
      opts: {},
      formule: null,
      note: "",
      vatSplit: [[1000, 2580]],
    },
  ],
  createdAt: Date.now(),
};

// ─── Réseau simulé ─────────────────────────────────────────────

interface Envoi {
  url: string;
  init?: RequestInit;
}

type Gestionnaire = () => Response | Promise<Response>;

function reponse(corps: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corps,
  } as unknown as Response;
}

let envois: Envoi[];
let routes: Record<string, Gestionnaire>;
let etatCourant: BorneEtat;

/** Les appels envoyés à une route donnée, dans l'ordre. */
const appels = (fragment: string): Envoi[] => envois.filter((e) => e.url.includes(fragment));

/** Corps JSON du dernier POST de commande. */
function dernierCorpsCommande(): Record<string, unknown> {
  const envoyes = appels("/api/borne/commande");
  expect(envoyes.length, "aucune commande n'a été envoyée").toBeGreaterThan(0);
  return JSON.parse(String(envoyes[envoyes.length - 1].init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  /* `Date.now()` est simulé comme le reste : la borne mesure l'inactivité avec
   * lui, pas avec un compteur de tics. */
  vi.useFakeTimers();
  localStorage.clear();
  window.history.replaceState({}, "", "/borne");

  envois = [];
  etatCourant = { ...ETAT_OUVERT };
  routes = {
    "/api/dishes": () => reponse(CARTE),
    "/api/formules": () => reponse({ formulas: [] }),
    "/api/borne/etat": () => reponse(etatCourant),
    "/api/borne/commande": () => reponse(CONFIRMATION, 201),
  };

  vi.stubGlobal("fetch", ((entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    envois.push({ url, init });
    const cle = Object.keys(routes).find((k) => url.startsWith(k));
    if (!cle) return Promise.reject(new Error(`route non simulée : ${url}`));
    return Promise.resolve().then(() => routes[cle]());
  }) as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Pilotage de l'écran ───────────────────────────────────────

/** Laisse arriver les réponses réseau (plusieurs promesses enchaînées). */
async function vider(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

async function monter(etat: BorneEtat = ETAT_OUVERT, avecJeton = true): Promise<void> {
  if (avecJeton) localStorage.setItem(BORNE_STORAGE_KEY, JETON);
  etatCourant = etat;
  render(<BorneClient initial={etat} />);
  await vider();
}

async function toucher(element: HTMLElement): Promise<void> {
  fireEvent.click(element);
  await vider();
}

async function patienter(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

/**
 * La tuile d'un plat sur la carte. Le nom seul ne suffit pas : les boutons
 * « Ajouter un Mafé bœuf » du panier portent aussi le nom du plat.
 */
const tuile = (nom: string): HTMLElement =>
  screen.getByRole("button", { name: new RegExp(`^${nom}`) });

/** Nombre de lignes dans le panier, vu par ses boutons de retrait. */
const lignes = (): HTMLElement[] => screen.queryAllByLabelText(/^Retirer un /);

/** Le compteur de la barre panier — « Mon panier (3) ». */
function nombreAuPanier(): number {
  const barre = screen.getByRole("button", { name: /Mon panier/ });
  return Number(/\((\d+)\)/.exec(barre.textContent ?? "")?.[1] ?? "-1");
}

/** Accueil → carte, puis N touches sur le mafé (sans options, ajout direct). */
async function commander(nb = 2, mode: RegExp = /Sur place/): Promise<void> {
  await toucher(screen.getByRole("button", { name: mode }));
  for (let i = 0; i < nb; i += 1) await toucher(tuile("Mafé bœuf"));
}

// ─── Configuration de l'appareil ───────────────────────────────

/* `/borne` est une adresse publique : sans jeton d'appareil, n'importe quel
 * téléphone de la salle pourrait envoyer en cuisine des commandes « sur place »
 * que personne ne viendra chercher. L'écran de configuration doit donc être un
 * passage obligé, et pas seulement un écran qu'on peut atteindre. */
describe("sans jeton d'appareil", () => {
  it("impose l'écran de configuration et ne laisse rien partir en cuisine", async () => {
    await monter(ETAT_OUVERT, false);

    expect(screen.getByRole("heading", { name: "Jeton de la borne" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sur place/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Touchez pour commander/ })).not.toBeInTheDocument();
    // Pas d'échappatoire : « Annuler » n'existe pas tant qu'aucun jeton n'est posé.
    expect(screen.queryByRole("button", { name: "Annuler" })).not.toBeInTheDocument();
    expect(appels("/api/borne/commande")).toHaveLength(0);
  });

  it("refuse d'enregistrer un jeton trop court pour en être un", async () => {
    await monter(ETAT_OUVERT, false);
    const champ = screen.getByLabelText("Jeton");

    fireEvent.change(champ, { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    fireEvent.change(champ, { target: { value: JETON.toLowerCase() } });
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();

    await toucher(screen.getByRole("button", { name: "Enregistrer" }));
    // Normalisé en majuscules, et conservé pour les prochains services.
    expect(localStorage.getItem(BORNE_STORAGE_KEY)).toBe(JETON);
    expect(screen.getByText("Touchez pour commander")).toBeInTheDocument();
  });

  it("laisse reprendre la main sur une tablette déjà réglée, par ?config=1", async () => {
    localStorage.setItem(BORNE_STORAGE_KEY, JETON);
    window.history.replaceState({}, "", "/borne?config=1");
    render(<BorneClient initial={ETAT_OUVERT} />);
    await vider();

    expect(screen.getByRole("heading", { name: "Jeton de la borne" })).toBeInTheDocument();
    // Cette fois le retour existe : la tablette était en état de servir.
    await toucher(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByText("Touchez pour commander")).toBeInTheDocument();
  });

  it.fails(
    "DÉFAUT — l'écran de configuration ne revient jamais à l'accueil tout seul",
    async () => {
      /* Sept appuis sur le nom du restaurant ouvrent la configuration, qui
       * affiche le jeton **en clair** dans un champ de saisie. Cet écran est le
       * seul à n'avoir aucun délai d'inactivité : un client curieux l'ouvre, et
       * la tablette reste indéfiniment à montrer le jeton qui autorise à
       * envoyer des commandes en cuisine. Attendu : le même retour automatique
       * à l'accueil que partout ailleurs. */
      await monter();
      const titre = screen.getByRole("heading", { name: "Ô 3 Saveurs" });
      for (let i = 0; i < 7; i += 1) fireEvent.click(titre);
      await vider();

      expect(screen.getByLabelText("Jeton")).toHaveValue(JETON);
      await patienter(BORNE_IDLE_MS + 2_000);
      expect(screen.queryByLabelText("Jeton")).not.toBeInTheDocument();
    },
  );
});

// ─── Accueil ───────────────────────────────────────────────────

/* L'écran d'accueil reste allumé des journées entières. S'il invite à commander
 * une heure après la fermeture, le client compose son panier et se fait refuser
 * au moment de valider — le pire moment pour l'apprendre. */
describe("accueil", () => {
  it("dit que la borne est en pause, sans proposer de commander", async () => {
    await monter({ ...ETAT_OUVERT, enabled: false });

    expect(screen.getByRole("heading", { name: "La borne est en pause" })).toBeInTheDocument();
    expect(screen.getByText("Commandez directement au comptoir.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sur place/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /À emporter/ })).not.toBeInTheDocument();
    // Le numéro du restaurant reste affiché : c'est le recours.
    expect(screen.getByText(ETAT_OUVERT.restaurant.phone)).toBeInTheDocument();
  });

  it("annonce le prochain service quand le restaurant est fermé", async () => {
    await monter({
      ...ETAT_OUVERT,
      open: false,
      nextService: { weekdayLabel: "Mardi", opensAt: "11:30" },
    });

    expect(screen.getByRole("heading", { name: "Nous sommes fermés" })).toBeInTheDocument();
    expect(screen.getByText(/Mardi à partir de 11:30/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sur place/ })).not.toBeInTheDocument();
  });

  it("n'offre « à emporter » que si les réglages l'autorisent", async () => {
    await monter({ ...ETAT_OUVERT, emporter: false });

    expect(screen.getByRole("button", { name: /Sur place/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /À emporter/ })).not.toBeInTheDocument();
  });

  it.fails("DÉFAUT — l'état relu toutes les minutes ne sert qu'à cet écran", async () => {
    /* `/api/borne/etat` est interrogé toutes les minutes pour une raison écrite
     * noir sur blanc dans la route : « sans cela, l'écran continuerait
     * d'inviter à commander une heure après la fermeture, et refuserait ensuite
     * chaque panier au moment de valider — le pire moment pour l'apprendre ».
     * C'est pourtant ce qui arrive : `disponible` n'est lu que par l'accueil.
     * Le client qui compose son panier pendant que le service se termine n'est
     * averti de rien, et ne l'apprend qu'au refus du serveur — après avoir
     * saisi son prénom. Attendu : l'écran carte dit que le service a fermé. */
    await monter();
    await commander(2);

    etatCourant = { ...ETAT_OUVERT, open: false, nextService: null };
    // Le client reste actif, sinon c'est le délai d'inactivité qui le ramène à
    // l'accueil — et le défaut passerait inaperçu.
    for (let i = 0; i < 7; i += 1) {
      await patienter(10_000);
      window.dispatchEvent(new Event("pointerdown"));
    }
    expect(appels("/api/borne/etat").length).toBeGreaterThan(0);

    expect(screen.getByText(/fermé/i)).toBeInTheDocument();
  });
});

// ─── Ce que la borne propose ───────────────────────────────────

describe("carte de la borne", () => {
  it("écarte le plat masqué, le plat sans prix et le plat sur commande", async () => {
    /* La borne ne sait ni prendre une date ni encaisser un acompte : un gigot à
     * 48 h de délai n'a rien à y faire. Un plat sans prix non plus — la borne
     * annoncerait 0,00 € au comptoir. */
    await monter();
    await toucher(screen.getByRole("button", { name: /Sur place/ }));

    expect(tuile("Mafé bœuf")).toBeInTheDocument();
    expect(screen.queryByText(MASQUE.name)).not.toBeInTheDocument();
    expect(screen.queryByText(SANS_PRIX.name)).not.toBeInTheDocument();
    expect(screen.queryByText(GIGOT.name)).not.toBeInTheDocument();
  });

  it("montre un plat épuisé sans permettre de l'ajouter", async () => {
    await monter();
    await toucher(screen.getByRole("button", { name: /Sur place/ }));

    expect(screen.getByText("Épuisé")).toBeInTheDocument();
    const epuise = tuile("Pastels poisson");
    expect(epuise).toBeDisabled();

    await toucher(epuise);
    expect(lignes()).toHaveLength(0);
  });

  it("dit qu'une carte injoignable est une panne, et se recharge", async () => {
    routes["/api/dishes"] = () => reponse({ error: "boom" }, 500);
    await monter();
    await toucher(screen.getByRole("button", { name: /Sur place/ }));

    expect(screen.getByText(/La carte n'a pas pu être chargée/)).toBeInTheDocument();

    routes["/api/dishes"] = () => reponse(CARTE);
    await toucher(screen.getByRole("button", { name: "Réessayer" }));
    expect(tuile("Mafé bœuf")).toBeInTheDocument();
  });
});

// ─── Panier ────────────────────────────────────────────────────

describe("panier de la borne", () => {
  it("fait une ligne à deux de deux ajouts identiques", async () => {
    await monter();
    await commander(2);

    expect(lignes()).toHaveLength(1);
    expect(nombreAuPanier()).toBe(2);
  });

  it("fait deux lignes du même plat quand la remarque diffère", async () => {
    /* La cuisine doit voir « sans piment » à part : fondre les deux lignes
     * ferait préparer deux assiettes identiques, dont une à refaire. */
    await monter();
    await toucher(screen.getByRole("button", { name: /Sur place/ }));

    for (const remarque of ["", "sans piment"]) {
      await toucher(tuile("Yassa poulet"));
      const fiche = within(screen.getByRole("dialog", { name: "Yassa poulet" }));
      await toucher(fiche.getByRole("button", { name: "Riz blanc" }));
      if (remarque) {
        fireEvent.change(fiche.getByLabelText(/précision pour la cuisine/), {
          target: { value: remarque },
        });
      }
      await toucher(fiche.getByRole("button", { name: /^Ajouter ·/ }));
    }

    expect(lignes()).toHaveLength(2);
    expect(nombreAuPanier()).toBe(2);
    expect(screen.getByText(/sans piment/)).toBeInTheDocument();
  });

  it("plafonne la quantité d'une ligne", async () => {
    await monter();
    await commander(1);

    const plus = screen.getByLabelText("Ajouter un Mafé bœuf");
    for (let i = 0; i < BORNE_MAX_QTY + 5; i += 1) await toucher(plus);

    expect(nombreAuPanier()).toBe(BORNE_MAX_QTY);
  });

  it.fails("DÉFAUT — la touche directe d'un plat ignore le stock restant", async () => {
    /* La fiche plat (`BornePlat`) plafonne bien la quantité au stock. Mais un
     * plat sans option s'ajoute d'un seul doigt, sans passer par la fiche, et
     * ce chemin ne connaît que le plafond de vingt : on compose un panier de
     * quatre tiep quand il en reste deux, et le serveur refuse le tout à la
     * validation. Attendu : le même plafond que dans la fiche. */
    await monter();
    await toucher(screen.getByRole("button", { name: /Sur place/ }));
    for (let i = 0; i < 4; i += 1) await toucher(tuile("Tiep rouge"));

    expect(nombreAuPanier()).toBeLessThanOrEqual(TIEP.stock ?? BORNE_MAX_QTY);
  });

  it("retire la ligne quand on retire le dernier article", async () => {
    await monter();
    await commander(1);
    expect(lignes()).toHaveLength(1);

    await toucher(screen.getByLabelText("Retirer un Mafé bœuf"));

    expect(lignes()).toHaveLength(0);
    expect(screen.getByText(/Touchez un plat pour l'ajouter/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Valider ma commande/ })).toBeDisabled();
  });
});

// ─── Ce qui part au serveur ────────────────────────────────────

describe("corps envoyé au serveur", () => {
  it("ne porte aucun montant, seulement des identifiants et des quantités", async () => {
    /* La règle fondatrice du projet, ici comme dans le tunnel web : c'est le
     * serveur qui relit les prix en base. Une tablette en salle est encore plus
     * facile à détourner qu'un navigateur — elle est posée à portée de main. */
    await monter();
    await commander(2);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    fireEvent.change(screen.getByLabelText(/Votre prénom/), { target: { value: "Awa" } });
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    const corps = dernierCorpsCommande();
    expect(Object.keys(corps).sort()).toEqual(["lines", "mode", "prenom"]);
    expect(corps.mode).toBe("sur_place");
    expect(corps.prenom).toBe("Awa");
    expect(corps.lines).toEqual([
      { dishId: MAFE.id, qty: 2, opts: {}, formule: null, note: "" },
    ]);
    // Ni « Cents », ni total, ni prix : aucun montant sous aucun nom.
    expect(JSON.stringify(corps)).not.toMatch(/cents|total|prix|price|montant/i);
    expect(JSON.stringify(corps)).not.toContain("1290");
  });

  it("présente le jeton de l'appareil dans l'en-tête de la requête", async () => {
    await monter();
    await commander(1);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    const envoye = appels("/api/borne/commande")[0];
    const entetes = envoye.init?.headers as Record<string, string>;
    expect(envoye.init?.method).toBe("POST");
    expect(entetes[BORNE_TOKEN_HEADER]).toBe(JETON);
  });
});

// ─── Rien ne survit d'un client au suivant ─────────────────────

/* L'invariant qui justifie l'existence de `borneCart` : vingt clients par
 * service sur la même tablette. Le panier et le prénom du précédent doivent
 * avoir disparu, qu'il soit parti satisfait ou qu'il ait simplement renoncé. */
describe("d'un client au suivant", () => {
  it("prévient avant de vider, puis ramène un panier vide à l'accueil", async () => {
    await monter();
    await commander(3);
    expect(nombreAuPanier()).toBe(3);

    // Quinze secondes avant l'échéance, on avertit — effacer une commande sous
    // les doigts de quelqu'un qui lit la carte serait pire que de la garder.
    await patienter(BORNE_IDLE_MS - BORNE_IDLE_WARN_MS);
    expect(screen.getByText("Toujours là ?")).toBeInTheDocument();
    expect(screen.getByText(/15 s/)).toBeInTheDocument();

    await patienter(BORNE_IDLE_WARN_MS);
    expect(screen.getByText("Touchez pour commander")).toBeInTheDocument();

    // Le client suivant arrive devant un panier vide.
    await toucher(screen.getByRole("button", { name: /Sur place/ }));
    expect(lignes()).toHaveLength(0);
    expect(nombreAuPanier()).toBe(0);
  });

  it("garde le panier quand on répond « je continue »", async () => {
    await monter();
    await commander(2);

    await patienter(BORNE_IDLE_MS - BORNE_IDLE_WARN_MS);
    await toucher(screen.getByRole("button", { name: "Je continue" }));

    expect(screen.queryByText("Toujours là ?")).not.toBeInTheDocument();
    expect(nombreAuPanier()).toBe(2);

    // Et le compte repart de zéro, pas de l'avertissement précédent.
    await patienter(BORNE_IDLE_MS - BORNE_IDLE_WARN_MS - 2_000);
    expect(screen.queryByText("Toujours là ?")).not.toBeInTheDocument();
  });

  it("efface le panier et le prénom quand l'écran final s'est écoulé", async () => {
    await monter();
    await commander(2);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    fireEvent.change(screen.getByLabelText(/Votre prénom/), { target: { value: "Awa" } });
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    // Écran final : le numéro d'attente, sur trois chiffres.
    expect(screen.getByText("007")).toBeInTheDocument();
    expect(screen.getByText(/Merci Awa/)).toBeInTheDocument();

    await patienter(BORNE_DONE_MS + 1_000);
    expect(screen.getByText("Touchez pour commander")).toBeInTheDocument();

    await toucher(screen.getByRole("button", { name: /Sur place/ }));
    expect(nombreAuPanier()).toBe(0);
    await toucher(tuile("Mafé bœuf"));
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    expect(screen.getByLabelText(/Votre prénom/)).toHaveValue("");
  });

  it("efface le prénom déjà saisi quand le client s'en va sans valider", async () => {
    await monter();
    await commander(1);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    fireEvent.change(screen.getByLabelText(/Votre prénom/), { target: { value: "Awa" } });

    await patienter(BORNE_IDLE_MS + 1_000);
    await toucher(screen.getByRole("button", { name: /Sur place/ }));
    await toucher(tuile("Mafé bœuf"));
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));

    expect(screen.getByLabelText(/Votre prénom/)).toHaveValue("");
  });

  it("ne laisse rien du panier dans le stockage du navigateur", async () => {
    /* Contrairement au panier du site, celui de la borne ne doit jamais être
     * persisté : un rechargement de la tablette ne doit pas ressusciter la
     * commande d'un client parti. */
    await monter();
    await commander(2);

    const stockage = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`);
    expect(stockage).toEqual([`${BORNE_STORAGE_KEY}=${JETON}`]);
    expect(sessionStorage.length).toBe(0);
  });
});

// ─── Quand le serveur refuse ───────────────────────────────────

describe("refus du serveur", () => {
  it("affiche le motif d'un plat épuisé sans perdre le panier", async () => {
    const motif = "« Mafé bœuf » n'est plus disponible en quantité suffisante (1 restant).";
    routes["/api/borne/commande"] = () => reponse({ error: motif }, 409);

    await monter();
    await commander(2);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    expect(screen.getByRole("heading", { name: /La commande n'est pas passée/ })).toBeInTheDocument();
    expect(screen.getByText(motif)).toBeInTheDocument();

    // Retour à la carte : le panier est entier, le client corrige ce qu'il veut.
    await toucher(screen.getByRole("button", { name: "Modifier ma commande" }));
    expect(nombreAuPanier()).toBe(2);
    expect(lignes()).toHaveLength(1);
  });

  it("renvoie à la configuration quand le jeton est refusé", async () => {
    routes["/api/borne/commande"] = () => reponse({ error: "Tablette non autorisée." }, 401);

    await monter();
    await commander(1);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    expect(screen.getByText("Tablette non autorisée.")).toBeInTheDocument();
    // Inutile de proposer « modifier ma commande » : ce n'est pas le panier.
    expect(screen.queryByRole("button", { name: "Modifier ma commande" })).not.toBeInTheDocument();
    await toucher(screen.getByRole("button", { name: "Configurer la tablette" }));
    expect(screen.getByRole("heading", { name: "Jeton de la borne" })).toBeInTheDocument();
  });

  it("dit clairement qu'une coupure réseau n'est pas un refus du restaurant", async () => {
    routes["/api/borne/commande"] = () => Promise.reject(new Error("offline"));

    await monter();
    await commander(2);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    expect(screen.getByText(/n'a pas pu joindre le serveur/)).toBeInTheDocument();
    expect(screen.getByText(/Adressez-vous au comptoir/)).toBeInTheDocument();
  });

  it.fails("DÉFAUT — une coupure réseau ne laisse aucune issue que de tout perdre", async () => {
    /* Le wifi de la salle saute une seconde : la borne affiche l'erreur, mais
     * les seuls boutons offerts sur un `status` de 0 ou 503 sont
     * « Recommencer », qui vide le panier. Six plats choisis à deux disparaissent
     * pour une coupure d'une seconde, et le client recommence tout ou renonce.
     * Attendu : un « Réessayer », ou au moins le retour à la carte qui garde le
     * panier, comme sur un refus 409. */
    routes["/api/borne/commande"] = () => Promise.reject(new Error("offline"));

    await monter();
    await commander(2);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));

    expect(
      screen.queryByRole("button", { name: /Réessayer|Modifier ma commande/ }),
    ).toBeInTheDocument();
  });

  it("relit la carte après un refus pour stock, pour que l'épuisé se voie", async () => {
    routes["/api/borne/commande"] = () => reponse({ error: "épuisé" }, 409);
    await monter();
    await commander(1);
    await toucher(screen.getByRole("button", { name: /Valider ma commande/ }));

    const avant = appels("/api/dishes").length;
    await toucher(screen.getByRole("button", { name: /^Confirmer ·/ }));
    expect(appels("/api/dishes").length).toBeGreaterThan(avant);
  });
});
