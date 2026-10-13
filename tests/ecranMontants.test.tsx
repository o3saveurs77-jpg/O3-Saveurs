// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lireMontant } from "@/lib/money";
import { PromotionsAdmin } from "@/components/admin/PromotionsAdmin";
import { MiseEnAvantAdmin } from "@/components/admin/MiseEnAvantAdmin";
import { FormulesAdmin } from "@/components/admin/FormulesAdmin";
import type { Dish, Formula } from "@/lib/menu";
import type { PromotionKind } from "@/lib/types";
import type { SpecialEntry } from "@/lib/dailySpecialCalendar";

/**
 * La saisie d'un montant, éprouvée **dans les écrans** et non plus seulement
 * dans les fonctions qu'ils appellent.
 *
 * Le défaut d'origine : les trois écrans construisaient leur corps de requête
 * avec `toCents(Number(saisie) || 0)`. Comme le formulaire est prérempli par
 * `toEuros` — qui produit « 25,00 », avec une virgule — `Number("25,00")`
 * valait `NaN` et `|| 0` le changeait en zéro. Conséquences réelles :
 *
 *  · rouvrir « −10 % dès 25 € » pour corriger sa date de fin la réenregistrait
 *    « dès le premier euro » ;
 *  · corriger une faute de frappe dans le nom d'un plat du jour l'annonçait
 *    **à 0,00 €** sur l'accueil et en haut de la Carte ;
 *  · effacer le prix d'une formule pour le retaper la remettait en vente à
 *    0,00 €.
 *
 * `tests/montantsAdmin.test.ts` couvre les lecteurs de formulaire isolément.
 * Ce qui manquait, et qui est le vrai sujet, c'est la chaîne complète :
 * j'ouvre une fiche existante, je ne touche pas au prix, j'enregistre — et ce
 * sont bien des **centimes entiers** exacts qui partent au serveur. Ces écrans
 * n'ayant jamais été ouverts, personne n'avait vu cette chaîne fonctionner.
 */

/* `lireMontant` est la règle commune. On l'espionne sans la remplacer : un
 * écran qui se remettrait à lire son champ lui-même — `Number()`, `parseFloat`,
 * un `toCents` local — se verrait immédiatement ici. */
vi.mock("@/lib/money", async () => {
  const reel = await vi.importActual<typeof import("@/lib/money")>("@/lib/money");
  return { ...reel, lireMontant: vi.fn(reel.lireMontant) };
});

const espionMontant = vi.mocked(lireMontant);

/* ─── Serveur factice ───────────────────────────────────────────────────── */

interface Appel {
  url: string;
  methode: string;
  corps: Record<string, unknown> | null;
}

type Reponse = { statut?: number; corps: unknown };

let appels: Appel[];
/** Réponses aux écritures (POST/PATCH/PUT/DELETE), dans l'ordre. */
let ecritures: Reponse[];
/** Réponses aux lectures, par fragment d'URL. */
let lectures: { fragment: string; corps: unknown }[];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      const methode = init?.method ?? "GET";
      appels.push({
        url: u,
        methode,
        corps: init?.body ? JSON.parse(String(init.body)) : null,
      });

      if (methode !== "GET") {
        const r = ecritures.shift() ?? { corps: {} };
        const statut = r.statut ?? 200;
        return {
          ok: statut >= 200 && statut < 300,
          status: statut,
          json: async () => r.corps,
        } as unknown as Response;
      }

      const route = lectures.find((l) => u.includes(l.fragment));
      return {
        ok: route !== undefined,
        status: route ? 200 : 404,
        json: async () => route?.corps ?? null,
      } as unknown as Response;
    }),
  );
}

/** La dernière écriture reçue par le serveur. */
function derniereEcriture(): Appel {
  const ecrites = appels.filter((a) => a.methode !== "GET");
  expect(ecrites.length).toBeGreaterThan(0);
  return ecrites[ecrites.length - 1];
}

beforeEach(() => {
  appels = [];
  ecritures = [];
  lectures = [];
  espionMontant.mockClear();
  stubFetch();
  // `window.scrollTo` n'existe pas dans jsdom : l'écran Promotions l'appelle en
  // ouvrant une fiche.
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });

/* ════════════════════════════════════════════════════════════════════════
 * PromotionsAdmin — « −10 % dès 25 € » ne doit plus devenir « dès 0 € »
 * ════════════════════════════════════════════════════════════════════════ */

const promoMontant = {
  id: "p1",
  code: "CINQ",
  label: "Cinq euros offerts",
  kind: "amount" as PromotionKind,
  value: 500,
  minSubtotalCents: 2500,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usedCount: 0,
  oncePerCustomer: false,
  weekday: null,
  auto: false,
  active: true,
  description: "5,00 € dès 25,00 €",
  remainingUses: null,
  orderCount: 0,
  revenueCents: 0,
};

async function ouvrirPromotion(promo = promoMontant) {
  lectures.push({ fragment: "/api/promotions", corps: { promotions: [promo] } });
  render(<PromotionsAdmin />);
  fireEvent.click(await screen.findByRole("button", { name: "Modifier" }));
  return {
    remise: await screen.findByPlaceholderText(promo.kind === "percent" ? "10" : "5,00"),
    minimum: screen.getByPlaceholderText("25,00"),
    enregistrer: screen.getByRole("button", { name: /^Enregistrer$/ }),
  };
}

describe("Promotions — un montant déjà enregistré", () => {
  it("s'affiche avec sa virgule, telle que `toEuros` la produit", async () => {
    const { remise, minimum } = await ouvrirPromotion();
    expect(remise).toHaveValue("5,00");
    expect(minimum).toHaveValue("25,00");
  });

  it("repart intact au serveur quand on enregistre sans y toucher", async () => {
    const { enregistrer } = await ouvrirPromotion();
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    const envoi = derniereEcriture();
    expect(envoi.url).toBe("/api/promotions/p1");
    // Le défaut d'origine : ces deux nombres retombaient à 0.
    expect(envoi.corps).toMatchObject({ value: 500, minSubtotalCents: 2500 });
  });

  it("conserve aussi un pourcentage, qui n'a pas la même unité", async () => {
    const { enregistrer } = await ouvrirPromotion({
      ...promoMontant,
      kind: "percent",
      value: 10,
      code: "BIENVENUE",
    });
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    // 10 reste 10 : un pourcentage n'est pas un montant, il ne passe pas en centimes.
    expect(derniereEcriture().corps).toMatchObject({ value: 10, minSubtotalCents: 2500 });
  });

  it("accepte la virgule française", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "30,50");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    expect(derniereEcriture().corps).toMatchObject({ minSubtotalCents: 3050 });
  });

  it("accepte le point tout autant — même montant, mêmes centimes", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "30.50");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    expect(derniereEcriture().corps).toMatchObject({ minSubtotalCents: 3050 });
  });

  it("tolère un copier-coller depuis un tableur : « 250,00 € »", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "250,00 €");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    expect(derniereEcriture().corps).toMatchObject({ minSubtotalCents: 25_000 });
  });

  it("refuse en revanche au-delà du plafond du serveur, au lieu d'un refus distant", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "1 250,00 €");

    expect(
      await screen.findByText("Le minimum de commande ne peut pas dépasser 1 000,00 €."),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("n'envoie que des entiers : un troisième chiffre décimal s'arrondit au centime", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "12,345");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    const { minSubtotalCents } = derniereEcriture().corps as { minSubtotalCents: number };
    // 12.345 * 100 vaut 1234.4999999999998 en flottant : 1235 prouve qu'on ne
    // passe pas par là.
    expect(minSubtotalCents).toBe(1235);
    expect(Number.isInteger(minSubtotalCents)).toBe(true);
  });
});

describe("Promotions — un champ de montant vidé pour être retapé", () => {
  it("se refuse explicitement au lieu de valoir zéro", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "");

    expect(await screen.findByText("Le minimum de commande est requis.")).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("n'appelle pas le serveur tant que le champ est vide", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "");
    fireEvent.click(enregistrer);

    await screen.findByText("Le minimum de commande est requis.");
    expect(appels.filter((a) => a.methode !== "GET")).toHaveLength(0);
  });

  it("refuse une saisie illisible plutôt que de la convertir", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "vingt-cinq euros");

    expect(
      await screen.findByText(
        "Le minimum de commande ne se lit pas : saisissez un montant en euros, par exemple 12,50.",
      ),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("refuse une remise vide sans la transformer en 0 €", async () => {
    const { remise, enregistrer } = await ouvrirPromotion();
    saisir(remise, "");

    expect(await screen.findByText("Le montant de la remise est requis.")).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("refuse un pourcentage vide sans le transformer en 0 %", async () => {
    const { remise, enregistrer } = await ouvrirPromotion({
      ...promoMontant,
      kind: "percent",
      value: 10,
      code: "BIENVENUE",
    });
    saisir(remise, "");

    expect(await screen.findByText("La remise en pourcentage est requise.")).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("refuse un montant négatif, que le champ texte n'empêche pas de taper", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();
    saisir(minimum, "-10");

    expect(
      await screen.findByText("Le minimum de commande ne peut pas être négatif."),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("laisse retaper après un refus, sans zéro installé en silence", async () => {
    const { minimum, enregistrer } = await ouvrirPromotion();

    saisir(minimum, "");
    await screen.findByText("Le minimum de commande est requis.");
    // Le champ reste vide : il n'a pas été reformaté en « 0,00 » entre-temps.
    expect(minimum).toHaveValue("");

    saisir(minimum, "18");
    expect(screen.queryByText("Le minimum de commande est requis.")).not.toBeInTheDocument();
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    expect(derniereEcriture().corps).toMatchObject({ minSubtotalCents: 1800 });
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * MiseEnAvantAdmin — un plat du jour ne doit plus s'annoncer gratuit
 * ════════════════════════════════════════════════════════════════════════ */

/** Un plat du jour tel que `/api/daily-specials` le renvoie. */
type PlatDuJourVu = SpecialEntry & { dishId: string | null };

const platDuJour: PlatDuJourVu = {
  id: "s1",
  dishId: null,
  name: "Couscous royal",
  priceCents: 1250,
  weekday: 1,
  date: null,
  active: true,
  position: 0,
};

async function ouvrirPlatDuJour(special: PlatDuJourVu = platDuJour) {
  lectures.push({ fragment: "/api/announcements", corps: [] });
  lectures.push({ fragment: "/api/banners", corps: [] });
  lectures.push({ fragment: "/api/daily-specials", corps: [special] });
  render(<MiseEnAvantAdmin />);

  fireEvent.click(await screen.findByRole("button", { name: /Plats du jour/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Modifier" }));
  return {
    nom: screen.getByPlaceholderText("Couscous royal"),
    prix: screen.getByPlaceholderText("12,50"),
    enregistrer: screen.getByRole("button", { name: /^Enregistrer$/ }),
  };
}

describe("Plat du jour — le prix affiché sur l'accueil", () => {
  it("se rouvre avec sa virgule", async () => {
    const { prix } = await ouvrirPlatDuJour();
    expect(prix).toHaveValue("12,50");
  });

  it("survit à la correction d'une faute de frappe dans le nom", async () => {
    const { nom, prix, enregistrer } = await ouvrirPlatDuJour();

    // Exactement le geste qui annonçait le plat à 0,00 € sur l'accueil.
    saisir(nom, "Couscous royal maison");
    expect(prix).toHaveValue("12,50");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    const envoi = derniereEcriture();
    expect(envoi.url).toBe("/api/daily-specials/s1");
    expect(envoi.corps).toMatchObject({ name: "Couscous royal maison", priceCents: 1250 });
  });

  it.each([
    ["9,90", 990],
    ["9.90", 990],
    // Copier-coller depuis un tableur : symbole et espace insécable compris.
    ["250,00 €", 25_000],
  ])("lit « %s » et envoie %i centimes entiers", async (saisie, attendu) => {
    const { prix, enregistrer } = await ouvrirPlatDuJour();
    saisir(prix, saisie);
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    const { priceCents } = derniereEcriture().corps as { priceCents: number };
    expect(priceCents).toBe(attendu);
    expect(Number.isInteger(priceCents)).toBe(true);
  });

  it("refuse un 0 explicite, qui s'afficherait « 0,00 € » en page d'accueil", async () => {
    const { prix, enregistrer } = await ouvrirPlatDuJour();
    saisir(prix, "0");

    expect(
      await screen.findByText(
        "Un plat du jour à 0,00 € serait annoncé gratuit sur l'accueil : laissez le champ vide pour ne pas afficher de prix.",
      ),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("refuse « 0,00 » tout autant — c'est ce que `toEuros` produit pour zéro", async () => {
    const { prix } = await ouvrirPlatDuJour();
    saisir(prix, "0,00");

    expect(await screen.findByRole("alert")).toHaveTextContent(/serait annoncé gratuit/);
  });

  it("refuse une saisie illisible au lieu de la convertir", async () => {
    const { prix, enregistrer } = await ouvrirPlatDuJour();
    saisir(prix, "12,50 €uros");

    expect(
      await screen.findByText(
        "Le prix du plat du jour ne se lit pas : saisissez un montant en euros, par exemple 12,50.",
      ),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  /* Ici le prix est **facultatif** par conception : un plat du jour sans prix
   * reprend celui du plat rattaché. « Vide » ne doit donc pas être refusé — mais
   * il ne doit surtout pas valoir zéro, et c'est ce qu'on vérifie : `null`
   * circule jusqu'au serveur, et rien ne s'affiche sur l'accueil. */
  it("envoie `null` et non `0` quand on efface le prix", async () => {
    const { prix, enregistrer } = await ouvrirPlatDuJour();
    saisir(prix, "");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    const corps = derniereEcriture().corps as { priceCents: number | null };
    expect(corps.priceCents).toBeNull();
    expect(corps.priceCents).not.toBe(0);
  });

  it("envoie `null` aussi quand le champ ne contient que des espaces", async () => {
    const { prix, enregistrer } = await ouvrirPlatDuJour();
    saisir(prix, "   ");
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
    expect((derniereEcriture().corps as { priceCents: number | null }).priceCents).toBeNull();
  });

  it("affiche le refus du serveur sans écraser la saisie", async () => {
    const { prix, enregistrer } = await ouvrirPlatDuJour();
    saisir(prix, "13,40");
    ecritures.push({ statut: 400, corps: { error: "Un plat du jour existe déjà ce lundi." } });
    fireEvent.click(enregistrer);

    expect(await screen.findByText("Un plat du jour existe déjà ce lundi.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("12,50")).toHaveValue("13,40");
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * FormulesAdmin — une formule ne doit plus repartir en vente à 0,00 €
 * ════════════════════════════════════════════════════════════════════════ */

const plat = (over: Partial<Dish> = {}): Dish =>
  ({
    id: "d-thieb",
    cat: "africaine",
    name: "Thiéboudienne",
    desc: "",
    priceCents: 1400,
    badge: null,
    photo: null,
    options: [],
    tags: [],
    spice: 0,
    popular: false,
    available: true,
    allergens: [],
    stock: null,
    position: 0,
    ...over,
  }) as Dish;

const formule = (over: Partial<Formula> = {}): Formula => ({
  id: "f1",
  code: "F1",
  name: "Formule midi",
  desc: "Plat + boisson",
  extra: "",
  priceCents: 1290,
  active: true,
  position: 0,
  slots: [
    {
      id: "s1",
      label: "Votre plat",
      required: true,
      position: 0,
      choices: [{ id: "c1", dishId: "d-thieb", supplementCents: 150, position: 0 }],
    },
  ],
  ...over,
});

async function ouvrirFormule(f = formule()) {
  lectures.push({ fragment: "/api/formules", corps: { formulas: [f] } });
  lectures.push({ fragment: "/api/dishes", corps: [plat()] });
  render(<FormulesAdmin />);

  const prix = await screen.findByPlaceholderText("10,90");
  return {
    prix,
    supplement: screen.getByLabelText("Supplément pour Thiéboudienne"),
    visible: screen.getByRole("checkbox", { name: /Proposée sur le site/ }),
    enregistrer: screen.getByRole("button", { name: /^Enregistrer$/ }),
  };
}

describe("Formules — le prix de vente", () => {
  it("se rouvre avec sa virgule et le supplément de chaque plat", async () => {
    const { prix, supplement } = await ouvrirFormule();
    expect(prix).toHaveValue("12,90");
    expect(supplement).toHaveValue("1,50");
  });

  it("repart en centimes entiers si on enregistre sans y toucher", async () => {
    const { enregistrer } = await ouvrirFormule();
    ecritures.push({ corps: { formula: formule() } });
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PUT")).toBe(true));
    const envoi = derniereEcriture();
    expect(envoi.url).toBe("/api/formules/f1");
    expect(envoi.corps).toMatchObject({ priceCents: 1290 });
    const corps = envoi.corps as { slots: { choices: { supplementCents: number }[] }[] };
    expect(corps.slots[0].choices[0].supplementCents).toBe(150);
  });

  it.each([
    ["15,50", 1550],
    ["15.50", 1550],
  ])("lit « %s » et envoie %i centimes", async (saisie, attendu) => {
    const { prix, enregistrer } = await ouvrirFormule();
    saisir(prix, saisie);
    ecritures.push({ corps: { formula: formule() } });
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PUT")).toBe(true));
    expect(derniereEcriture().corps).toMatchObject({ priceCents: attendu });
  });

  it("ne reformate pas le champ pendant la frappe : « 10, » reste « 10, »", async () => {
    const { prix, enregistrer } = await ouvrirFormule();
    saisir(prix, "10,");

    // Le défaut d'origine : `value={toEuros(draft.priceCents)}` renvoyait
    // « 0,00 » dans le champ dès qu'il devenait inexploitable, et on ne pouvait
    // plus finir de taper.
    expect(prix).toHaveValue("10,");
    expect(enregistrer).not.toBeDisabled();
  });

  it("annonce le rappel du format, et non un prix faux, sur une saisie illisible", async () => {
    const { prix } = await ouvrirFormule();
    saisir(prix, "15,,90");

    expect(screen.getByText("Montant en euros, par exemple 10,90")).toBeInTheDocument();
    expect(screen.queryByText(/hors suppléments/)).not.toBeInTheDocument();
  });

  it("refuse un prix vidé au lieu de mettre la formule en vente à 0,00 €", async () => {
    const { prix, enregistrer } = await ouvrirFormule();
    saisir(prix, "");

    expect(await screen.findByText("Le prix de la formule est requis.")).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
    expect(appels.filter((a) => a.methode !== "GET")).toHaveLength(0);
  });

  it("refuse un 0 explicite tant que la formule est proposée sur le site", async () => {
    const { prix, enregistrer } = await ouvrirFormule();
    saisir(prix, "0");

    expect(
      await screen.findByText(/Une formule proposée sur le site ne peut pas être à 0,00 €/),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("accepte 0 pour une formule masquée — tarif pas encore arbitré", async () => {
    const { prix, visible, enregistrer } = await ouvrirFormule();
    fireEvent.click(visible);
    saisir(prix, "0");

    await waitFor(() => expect(enregistrer).not.toBeDisabled());
    ecritures.push({ corps: { formula: formule({ priceCents: 0, active: false }) } });
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PUT")).toBe(true));
    expect(derniereEcriture().corps).toMatchObject({ priceCents: 0, active: false });
  });

  it("refuse une saisie illisible au lieu de la convertir", async () => {
    const { prix, enregistrer } = await ouvrirFormule();
    saisir(prix, "douze euros cinquante");

    expect(
      await screen.findByText(
        "Le prix de la formule ne se lit pas : saisissez un montant en euros, par exemple 12,50.",
      ),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  it("nomme le plat fautif quand c'est son supplément qui ne se lit pas", async () => {
    const { supplement, enregistrer } = await ouvrirFormule();
    saisir(supplement, "un euro");

    expect(
      await screen.findByText(
        "Le supplément de « Thiéboudienne » ne se lit pas : saisissez un montant en euros, par exemple 12,50.",
      ),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
  });

  /* Un supplément vidé pour être retapé est refusé explicitement, et non
   * ramené à zéro : la cliente voit le refus et peut finir sa saisie. C'est la
   * même règle que partout, mais elle mérite d'être tenue ici — le `?? 0` qui
   * suit l'appel dans `lireFormule` laisserait croire au lecteur que le vide
   * passe en silence pour 0 (il est en réalité inatteignable, `lireMontant`
   * étant appelée sans `requis: false`). */
  it("refuse un supplément vidé, au lieu de le ramener discrètement à 0", async () => {
    const { supplement, enregistrer } = await ouvrirFormule();
    saisir(supplement, "");

    expect(
      await screen.findByText("Le supplément de « Thiéboudienne » est requis."),
    ).toBeInTheDocument();
    expect(enregistrer).toBeDisabled();
    expect(appels.filter((a) => a.methode !== "GET")).toHaveLength(0);
  });

  it("accepte en revanche un supplément à 0, qui est le cas le plus fréquent", async () => {
    const { supplement, enregistrer } = await ouvrirFormule();
    saisir(supplement, "0");
    ecritures.push({ corps: { formula: formule() } });
    fireEvent.click(enregistrer);

    await waitFor(() => expect(appels.some((a) => a.methode === "PUT")).toBe(true));
    const corps = derniereEcriture().corps as { slots: { choices: { supplementCents: number }[] }[] };
    expect(corps.slots[0].choices[0].supplementCents).toBe(0);
  });

  it("affiche le prix annoncé sous le champ, hors suppléments", async () => {
    const { prix } = await ouvrirFormule();
    saisir(prix, "11,90");
    expect(screen.getByText("11,90 € — hors suppléments")).toBeInTheDocument();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * La règle commune
 * ════════════════════════════════════════════════════════════════════════ */

/* `lireMontant` existe pour qu'il n'y ait **qu'une** façon de lire un montant
 * dans le back-office. Trois écrans la contournaient ; rien n'empêche un
 * quatrième de recommencer. Ces tests tiennent l'invariant par les deux bouts :
 * à l'exécution, la saisie brute passe bien par la règle commune ; à la
 * lecture, aucun des trois n'importe plus l'ancien `toCents`. */
describe("aucun écran ne contourne `lireMontant`", () => {
  it("Promotions lui transmet la saisie brute, virgule comprise", async () => {
    await ouvrirPromotion();
    const recues = espionMontant.mock.calls.map((c) => c[0]);
    expect(recues).toContain("25,00");
    expect(recues).toContain("5,00");
  });

  it("Promotions lui transmet même une saisie illisible, sans la pré-mâcher", async () => {
    const { minimum } = await ouvrirPromotion();
    espionMontant.mockClear();
    saisir(minimum, "n'importe quoi");

    expect(espionMontant.mock.calls.map((c) => c[0])).toContain("n'importe quoi");
  });

  it("Plat du jour lui transmet la saisie brute", async () => {
    const { prix } = await ouvrirPlatDuJour();
    espionMontant.mockClear();
    saisir(prix, "12,50 €uros");

    expect(espionMontant.mock.calls.map((c) => c[0])).toContain("12,50 €uros");
  });

  it("Formules lui transmet le prix et chaque supplément", async () => {
    await ouvrirFormule();
    const recues = espionMontant.mock.calls.map((c) => c[0]);
    expect(recues).toContain("12,90");
    expect(recues).toContain("1,50");
  });

  it("Formules lui transmet aussi un supplément retapé", async () => {
    const { supplement } = await ouvrirFormule();
    espionMontant.mockClear();
    saisir(supplement, "2,30");

    expect(espionMontant.mock.calls.map((c) => c[0])).toContain("2,30");
  });

  it("n'importe plus `toCents` depuis `lib/money`", () => {
    for (const fichier of ["PromotionsAdmin", "MiseEnAvantAdmin", "FormulesAdmin"]) {
      const source = readFileSync(`components/admin/${fichier}.tsx`, "utf8");
      const ligne = source.match(/^import \{([^}]*)\} from "@\/lib\/money";$/m);
      expect(ligne, `${fichier} doit importer depuis @/lib/money`).not.toBeNull();

      const nommes = ligne![1].split(",").map((n) => n.trim());
      expect(nommes, `${fichier} doit lire ses montants avec lireMontant`).toContain("lireMontant");
      // `toCents` rend `null` sur l'illisible, mais les écrans qui s'en
      // servaient le changeaient en 0 : c'est le chemin à ne pas reprendre.
      expect(nommes, `${fichier} ne doit plus passer par toCents`).not.toContain("toCents");
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * Défauts trouvés en ouvrant ces écrans
 * ════════════════════════════════════════════════════════════════════════ */

/* `OrdersAdmin`, `ClientsAdmin` et `ComptaAdmin` ont été corrigés : une lecture
 * en échec n'y ressemble plus à une absence de données. Les trois écrans de
 * montants, eux, n'ont pas reçu la même correction — et c'est le même piège,
 * aux mêmes conséquences.
 *
 * La cliente qui ouvre Promotions pendant une coupure lit « Aucune promotion ·
 * 0,00 € de commandes générées » et en recrée une qui existe déjà ; le serveur
 * refuse alors pour code en doublon, ce qui ressemble à un bug de plus. Et
 * aucun des trois n'offre de reprise : la seule issue est de recharger la page,
 * et rien ne le dit. */
describe("DÉFAUT — une lecture en échec ressemble encore à une absence", () => {
  it("Promotions dit bien que la lecture a échoué", async () => {
    render(<PromotionsAdmin />); // aucune route enregistrée : la lecture échoue
    expect(
      await screen.findByText("Les promotions n'ont pas pu être chargées."),
    ).toBeInTheDocument();
  });

  /* GRAVITÉ MOYENNE — l'état vide s'affiche *en plus* du message d'erreur, avec
   * son invitation « Créez-en une pour l'appliquer au panier de vos clients ».
   * Les compteurs de l'en-tête mentent de la même façon : « 0 promotion ·
   * 0 active · 0,00 € de commandes générées ». */
  it.fails("Promotions n'annonce pas « Aucune promotion » quand elle n'a rien pu lire", async () => {
    render(<PromotionsAdmin />);
    await screen.findByText("Les promotions n'ont pas pu être chargées.");

    expect(screen.queryByText("Aucune promotion")).not.toBeInTheDocument();
  });

  /* GRAVITÉ MOYENNE — `charger()` de `MiseEnAvantAdmin` fait
   * `if (rs.ok) setSpecials(…)` : une réponse non-2xx est ignorée **en
   * silence**, le `catch` ne couvrant que les erreurs levées par `fetch`.
   * `/api/daily-specials` en panne donne donc « Aucun plat du jour » sans le
   * moindre message, sur l'écran qui décide de ce qui s'affiche en haut de la
   * Carte. Les annonces et les bandeaux sont dans le même cas. */
  it.fails("Plats du jour signale une lecture en échec au lieu de se dire vide", async () => {
    lectures.push({ fragment: "/api/announcements", corps: [] });
    lectures.push({ fragment: "/api/banners", corps: [] });
    // `/api/daily-specials` n'est pas enregistrée : elle répondra 404.
    render(<MiseEnAvantAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: /Plats du jour/ }));

    expect(screen.queryByText("Aucun plat du jour")).not.toBeInTheDocument();
  });

  it("Formules dit bien que la lecture a échoué", async () => {
    render(<FormulesAdmin />);
    expect(await screen.findByText("Les formules n'ont pas pu être chargées.")).toBeInTheDocument();
  });

  /* GRAVITÉ MOYENNE — même défaut : « Aucune formule · Créez-en une pour la
   * proposer sur la page Formules », alors qu'elles existent peut-être toutes.
   * Créer une formule depuis cet écran l'appellerait « F1 », au risque de
   * heurter un code déjà pris. */
  it.fails("Formules n'annonce pas « Aucune formule » quand elle n'a rien pu lire", async () => {
    render(<FormulesAdmin />);
    await screen.findByText("Les formules n'ont pas pu être chargées.");

    expect(screen.queryByText("Aucune formule")).not.toBeInTheDocument();
  });

  /* GRAVITÉ MOYENNE — aucun des trois écrans n'offre de « Réessayer », là où
   * Horaires, Commandes, Clients et Compta en ont un. */
  it.fails("les trois écrans proposent de relancer la lecture", async () => {
    render(<PromotionsAdmin />);
    await screen.findByText("Les promotions n'ont pas pu être chargées.");

    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });
});

/* La date d'un plat du jour est un montant comme un autre, du point de vue du
 * dégât : un prix juste annoncé le mauvais jour ne vaut pas mieux qu'un prix
 * faux. Ce bloc est ici parce qu'il porte sur le même formulaire que les tests
 * de prix ci-dessus.
 *
 * `dateOnly()` (lib/promotionValidation.ts) enregistre la date à **minuit
 * UTC** ; `versDate()` dans `MiseEnAvantAdmin` la relit avec
 * `getFullYear/getMonth/getDate`, c'est-à-dire dans le fuseau du **navigateur**.
 * Tant qu'on administre depuis la France (UTC+1/+2) les deux concordent. Depuis
 * un fuseau en retard sur UTC, la date reculée d'un jour s'affiche dans le
 * champ — et c'est elle qui repart au serveur si on enregistre. C'est exactement
 * le décalage que `ComptaAdmin` documente avoir corrigé chez lui. */
describe("DÉFAUT — la date d'un plat du jour se lit dans le fuseau du navigateur", () => {
  const fuseauInitial = process.env.TZ;
  /* Minuit UTC du 15 octobre 2026, tel que la base le stocke. */
  const quinzeOctobre = Date.UTC(2026, 9, 15);

  it("s'affiche correctement depuis la France", async () => {
    await ouvrirPlatDuJour({ ...platDuJour, weekday: null, date: quinzeOctobre });
    expect(screen.getByLabelText("Date précise")).toHaveValue("2026-10-15");
  });

  describe("depuis un fuseau en retard sur UTC", () => {
    beforeEach(() => {
      process.env.TZ = "America/New_York";
    });
    afterEach(() => {
      process.env.TZ = fuseauInitial;
    });

    /* GRAVITÉ FAIBLE — il faut administrer depuis un fuseau en retard sur UTC
     * (ou une machine mal réglée) pour le déclencher. Mais alors le plat du
     * jour change de jour sans que rien ne le signale, et le simple fait de
     * rouvrir la fiche pour corriger son prix suffit à le déplacer. */
    it.fails("montre la date enregistrée, et non la veille", async () => {
      await ouvrirPlatDuJour({ ...platDuJour, weekday: null, date: quinzeOctobre });
      expect(screen.getByLabelText("Date précise")).toHaveValue("2026-10-15");
    });

    it.fails("ne déplace pas le plat d'un jour en enregistrant un prix corrigé", async () => {
      const { prix, enregistrer } = await ouvrirPlatDuJour({
        ...platDuJour,
        weekday: null,
        date: quinzeOctobre,
      });
      saisir(prix, "13,00");
      fireEvent.click(enregistrer);

      await waitFor(() => expect(appels.some((a) => a.methode === "PATCH")).toBe(true));
      expect(derniereEcriture().corps).toMatchObject({ date: "2026-10-15" });
    });
  });
});
