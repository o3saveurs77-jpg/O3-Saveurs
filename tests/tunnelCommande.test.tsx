// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CartProvider } from "@/components/cart/CartContext";
import { AuthProvider } from "@/components/providers/AuthContext";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import type { CartLine } from "@/lib/types";
import type { Zone } from "@/lib/menu";
import type { DeliveryQuote } from "@/app/api/delivery-quote/route";

/* `.env` pointe sur la base de **production** et la clé Resend est active.
 * `next-auth/react` est neutralisé parce que `AuthProvider` l'importe : sans
 * cela un test pourrait déclencher une redirection Auth0. */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({
  sendMail: vi.fn(async () => ({ ok: false as const, error: "email neutralisé en test" })),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

/**
 * Le tunnel de commande public, jamais parcouru par un test jusqu'ici.
 *
 * Ce qu'il protège, dans l'ordre d'importance :
 *
 *  · **le corps envoyé ne porte aucun montant** — c'est la règle fondatrice du
 *    projet, celle qui a fermé la faille permettant d'encaisser un panier de
 *    80 € à un centime. Ni prix unitaire, ni sous-total, ni frais, ni total, ni
 *    zone tarifaire : le serveur relit tout en base ;
 *  · **les blocages annoncés correspondent à ce qui manque vraiment** — le
 *    bouton se contentait d'être grisé, et le client concluait à un site cassé.
 *    La liste des blocages *est* la définition de la validité : un blocage sans
 *    message, ou un message sans blocage, est un client perdu ;
 *  · **le consentement CGV est actif** — jamais pré-coché (art. 1127-1 C. civ.),
 *    sinon l'exclusion du droit de rétractation n'est pas opposable ;
 *  · **un échec ne coûte pas le panier** — ni une coupure réseau, ni un refus
 *    du serveur, ni un paiement abandonné.
 *
 * Tout le réseau est simulé : le tunnel appelle `/api/settings`, `/api/zones`,
 * `/api/delivery-info`, `/api/slots` et `/api/delivery-quote` au montage.
 */

// ─── Fixtures ──────────────────────────────────────────────────

/** Dupliqué depuis `CartContext` (constante privée) : le panier se sème ici. */
const CLE_PANIER = "ots_cart_v2";

function ligne(over: Partial<CartLine> = {}): CartLine {
  return {
    key: "d-mafe|{}||",
    dishId: "d-mafe",
    formulaId: null,
    picks: null,
    name: "Mafé bœuf",
    photo: null,
    unitPriceCents: 1290,
    qty: 2,
    opts: {},
    formule: null,
    note: "",
    leadTimeHours: 0,
    ...over,
  };
}

const SOUS_TOTAL = 2580;

const ZONE: Zone = {
  idx: 1,
  minimumCents: 2000,
  feeCents: 250,
  villes: ["Pontault-Combault"],
  zips: ["77340"],
};

function devis(over: Partial<DeliveryQuote> = {}): DeliveryQuote {
  return {
    via: "zones",
    deliverable: true,
    distanceKm: null,
    durationMinutes: null,
    feeCents: ZONE.feeCents,
    minimumCents: ZONE.minimumCents,
    maxKm: null,
    message: null,
    ...over,
  };
}

const CRENEAUX_OUVERTS = {
  open: true,
  slots: ["18:30", "19:00", "19:30"],
  leadTimeMinutes: 25,
  nextService: null,
};

const DATES_SUR_COMMANDE = {
  leadTimeHours: 48,
  days: [
    {
      date: "2026-10-16",
      label: "vendredi 16 octobre",
      weekdayLabel: "vendredi",
      slots: ["11:30", "12:00"],
    },
  ],
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

const appels = (fragment: string): Envoi[] => envois.filter((e) => e.url.includes(fragment));

/** Corps JSON du dernier POST vers `/api/checkout`. */
function corpsCommande(): Record<string, unknown> {
  const envoyes = appels("/api/checkout");
  expect(envoyes.length, "aucune commande n'a été envoyée").toBeGreaterThan(0);
  return JSON.parse(String(envoyes[envoyes.length - 1].init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/commander");

  envois = [];
  routes = {
    "/api/auth/me": () => reponse(null),
    "/api/settings": () => reponse({ settings: { "restaurant.phone": "0160000000" } }),
    "/api/zones": () => reponse([ZONE]),
    "/api/delivery-info": () => reponse({ freeDeliveryThresholdCents: null }),
    "/api/slots": () => reponse(CRENEAUX_OUVERTS),
    "/api/preorder-slots": () => reponse(DATES_SUR_COMMANDE),
    "/api/delivery-quote": () => reponse(devis()),
    "/api/address/suggest": () => reponse({ suggestions: [] }),
    // Réponse 200 sans `url` : le tunnel s'arrête sur son message d'erreur au
    // lieu de naviguer vers Stripe, que jsdom ne sait pas suivre. Le corps
    // envoyé, lui, est bien parti — c'est ce qu'on vient inspecter.
    "/api/checkout": () => reponse({}),
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

async function vider(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

async function patienter(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

async function monter(lignes: CartLine[] = [ligne()]): Promise<void> {
  localStorage.setItem(CLE_PANIER, JSON.stringify(lignes));
  render(
    <AuthProvider>
      <CartProvider>
        <CheckoutClient />
      </CartProvider>
    </AuthProvider>,
  );
  await vider();
}

async function toucher(element: HTMLElement): Promise<void> {
  fireEvent.click(element);
  await vider();
}

function saisir(libelle: RegExp | string, valeur: string): void {
  fireEvent.change(screen.getByLabelText(libelle), { target: { value: valeur } });
}

/** Les blocages tels que le client les lit, en clair, sous le bouton. */
function blocages(): string[] {
  const bloc = document.getElementById("co-blocages");
  if (!bloc) return [];
  return [...bloc.querySelectorAll("li")].map((li) => li.textContent?.trim() ?? "");
}

const boutonValider = (): HTMLElement =>
  screen.getByRole("button", { name: /^(Payer|Confirmer la commande|Traitement)/ });

/** Coordonnées complètes et valides, livraison comprise. */
async function remplirTout(): Promise<void> {
  saisir("Nom complet", "Awa Diallo");
  saisir("Email", "awa@example.com");
  saisir("Téléphone", "06 12 34 56 78");
  saisir("Adresse", "12 rue du Chêne");
  saisir("Code postal", "77340");
  saisir("Ville", "Pontault-Combault");
  fireEvent.click(screen.getByLabelText(/conditions générales de vente/));
  // Le devis de livraison est débouncé à 500 ms.
  await patienter(600);
}

/** Montant lu dans le récapitulatif, en centimes (NaN si la case n'en porte pas). */
function montantAffiche(libelle: string): number {
  const cellule = screen.getByText(libelle).nextElementSibling;
  const chiffres = (cellule?.textContent ?? "").replace(/[^\d,]/g, "").replace(",", ".");
  return chiffres ? Math.round(Number(chiffres) * 100) : Number.NaN;
}

// ─── Panier vide ───────────────────────────────────────────────

describe("panier vide", () => {
  it("renvoie à la carte plutôt que d'afficher un formulaire inutile", async () => {
    await monter([]);
    expect(screen.getByRole("heading", { name: "Votre panier est vide" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nom complet")).not.toBeInTheDocument();
  });

  it("explique un paiement abandonné au lieu de laisser un panier vide sans raison", async () => {
    // `?canceled=1` : retour de Stripe après renoncement.
    window.history.replaceState({}, "", "/commander?canceled=1");
    await monter([]);
    expect(screen.getByText(/aucun montant n'a été débité/i)).toBeInTheDocument();
  });

  it("annonce un panier intact au retour d'un paiement abandonné", async () => {
    window.history.replaceState({}, "", "/commander?canceled=1");
    await monter();
    expect(screen.getByText(/votre panier est\s+intact/i)).toBeInTheDocument();
    expect(screen.getByText(/2× Mafé bœuf/)).toBeInTheDocument();
  });
});

// ─── Blocages ──────────────────────────────────────────────────

/* Le client doit lire pourquoi il ne peut pas payer. Chaque blocage annoncé
 * correspond à une condition réelle de `valid` : sans cette équivalence, le
 * bouton reste mort sans explication, ou s'active sur un formulaire incomplet
 * et c'est le serveur qui refuse. */
describe("ce qui bloque la validation", () => {
  it("nomme chaque information manquante, et garde le bouton inerte", async () => {
    await monter();

    const annonces = blocages().join(" | ");
    for (const attendu of [
      /Indiquez votre nom complet/,
      /adresse email valide/,
      /numéro de téléphone valide/,
      /Indiquez votre adresse de livraison/,
      /Indiquez votre ville/,
      /code postal à 5 chiffres/,
      /conditions générales de vente/,
    ]) {
      expect(annonces).toMatch(attendu);
    }
    expect(boutonValider()).toBeDisabled();
  });

  it("ne bloque plus rien quand tout est renseigné", async () => {
    await monter();
    await remplirTout();

    expect(blocages()).toEqual([]);
    expect(boutonValider()).toBeEnabled();
  });

  it("ne demande pas d'adresse pour une commande à emporter", async () => {
    await monter();
    await toucher(screen.getByRole("button", { name: /À emporter/ }));

    expect(screen.queryByLabelText("Adresse")).not.toBeInTheDocument();
    // (« adresse email » reste demandée : c'est l'adresse postale qui s'efface)
    expect(blocages().join(" | ")).not.toMatch(/adresse de livraison|votre ville|code postal/i);
    expect(blocages().join(" | ")).toMatch(/conditions générales/);
  });

  it("n'a jamais la case CGV pré-cochée, et bloque tant qu'elle ne l'est pas", async () => {
    /* Un consentement pré-coché n'est pas un consentement : sans lui,
     * l'exclusion du droit de rétractation sur les denrées périssables n'est
     * pas opposable. */
    await monter();
    const cgv = screen.getByLabelText(/conditions générales de vente/);
    expect(cgv).not.toBeChecked();

    saisir("Nom complet", "Awa Diallo");
    saisir("Email", "awa@example.com");
    saisir("Téléphone", "06 12 34 56 78");
    saisir("Adresse", "12 rue du Chêne");
    saisir("Code postal", "77340");
    saisir("Ville", "Pontault-Combault");
    await patienter(600);

    expect(blocages()).toEqual(["Cochez l'acceptation des conditions générales de vente."]);
    await toucher(cgv);
    expect(blocages()).toEqual([]);
  });

  it("ne propose pas non plus de créer un compte sans l'avoir demandé", async () => {
    await monter();
    expect(screen.getByLabelText(/Créer un compte/)).not.toBeChecked();
  });

  it("refuse un email ou un téléphone qui ne peut pas servir à joindre le client", async () => {
    // Ce sont les deux seuls moyens de prévenir d'un retard ou d'une rupture.
    await monter();
    await remplirTout();

    saisir("Email", "awa@diallo");
    expect(blocages().join(" ")).toMatch(/adresse email valide/);

    saisir("Email", "awa@example.com");
    saisir("Téléphone", "06 12");
    expect(blocages().join(" ")).toMatch(/téléphone valide/);
  });

  it("annonce le minimum de commande manquant, et bloque", async () => {
    routes["/api/delivery-quote"] = () => reponse(devis({ minimumCents: 4000 }));
    await monter();
    await remplirTout();

    expect(blocages().join(" ")).toMatch(/Il manque .* pour atteindre le minimum/);
    expect(boutonValider()).toBeDisabled();
  });

  it("annonce une adresse hors zone avec le motif du serveur, et bloque", async () => {
    routes["/api/delivery-quote"] = () =>
      reponse(
        devis({
          deliverable: false,
          via: "distance",
          distanceKm: 18,
          maxKm: 8,
          message: "Cette adresse est à 18 km, au-delà des 8 km que nous livrons.",
        }),
      );
    await monter();
    await remplirTout();

    expect(screen.getByText(/au-delà des 8 km/)).toBeInTheDocument();
    expect(blocages().join(" ")).toMatch(/hors de notre zone de livraison/);
  });
});

// ─── Créneaux ──────────────────────────────────────────────────

describe("créneaux et fermeture", () => {
  it("dit la fermeture et bloque quand aucun service n'est à venir", async () => {
    routes["/api/slots"] = () =>
      reponse({ open: false, slots: [], leadTimeMinutes: 25, nextService: null });
    await monter();
    await remplirTout();

    expect(screen.getByText(/Nous sommes fermés/)).toBeInTheDocument();
    expect(blocages().join(" ")).toMatch(/Aucun créneau n'est disponible/);
    expect(boutonValider()).toBeDisabled();
  });

  it("accepte une commande pour le prochain service, en le disant", async () => {
    routes["/api/slots"] = () =>
      reponse({
        open: false,
        slots: [],
        leadTimeMinutes: 25,
        nextService: { weekday: 2, weekdayLabel: "Mardi", label: "Midi", opensAt: "11:30" },
      });
    await monter();
    await remplirTout();

    expect(screen.getByText(/transmise en cuisine à l'ouverture/)).toBeInTheDocument();
    expect(blocages()).toEqual([]);
    await toucher(boutonValider());
    expect(corpsCommande().slot).toBe("next");
  });

  it("ne présente pas une panne de /api/slots comme une fermeture", async () => {
    /* Une liste de créneaux vide fabriquée sur un échec réseau annonçait au
     * client que le restaurant était fermé : il repartait en le croyant. */
    routes["/api/slots"] = () => reponse({ error: "boom" }, 500);
    await monter();

    expect(screen.queryByText(/Nous sommes fermés/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toMatch(/momentanément indisponible/);
    expect(screen.getByRole("alert").textContent).toMatch(/01 60 00 00 00/);

    routes["/api/slots"] = () => reponse(CRENEAUX_OUVERTS);
    await toucher(screen.getByRole("button", { name: "Réessayer" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.fails("DÉFAUT — une panne de créneaux est annoncée comme « à compléter »", async () => {
    /* `/api/slots` est en panne : le bandeau le dit bien, mais la liste sous le
     * bouton annonce « Il reste une chose à compléter : Chargement des créneaux
     * en cours… », et ce chargement n'aboutira jamais. Le client cherche
     * indéfiniment quoi compléter, sur une page qui lui dit par ailleurs
     * d'appeler. Attendu : un blocage qui nomme la panne. */
    routes["/api/slots"] = () => reponse({ error: "boom" }, 500);
    await monter();
    await remplirTout();

    expect(blocages().join(" ")).not.toMatch(/Chargement/);
  });
});

// ─── Le corps envoyé ───────────────────────────────────────────

describe("corps envoyé à /api/checkout", () => {
  it("ne porte aucun montant, sous aucun nom", async () => {
    await monter();
    await remplirTout();
    saisir(/Code promotionnel/, "bienvenue");
    await toucher(boutonValider());

    const corps = corpsCommande();
    expect(Object.keys(corps).sort()).toEqual([
      "customer",
      "lines",
      "mode",
      "paymentMethod",
      "promoCode",
      "slot",
    ]);
    expect(corps.lines).toEqual([
      { dishId: "d-mafe", qty: 2, opts: {}, formule: null, note: "" },
    ]);
    expect(corps.promoCode).toBe("BIENVENUE");

    const brut = JSON.stringify(corps);
    expect(brut).not.toMatch(/cents|total|subtotal|montant|prix|price|fee|frais/i);
    // Et aucun des montants affichés ne s'y trouve en clair.
    expect(brut).not.toContain(String(SOUS_TOTAL));
    expect(brut).not.toContain(String(ZONE.feeCents));
  });

  it("n'envoie pas la zone tarifaire : elle se déduit du code postal", async () => {
    // Un client de Serris pouvait choisir « Zone 1 » et se faire livrer à 25 km
    // pour 2,50 €.
    await monter();
    await remplirTout();
    await toucher(boutonValider());

    const corps = corpsCommande();
    expect(JSON.stringify(corps)).not.toMatch(/"zone/i);
    expect(corps.customer).toEqual({
      name: "Awa Diallo",
      email: "awa@example.com",
      phone: "06 12 34 56 78",
      address: "12 rue du Chêne",
      city: "Pontault-Combault",
      zip: "77340",
      placeId: null,
    });
  });

  it("n'envoie pas d'adresse pour une commande à emporter", async () => {
    await monter();
    await toucher(screen.getByRole("button", { name: /À emporter/ }));
    saisir("Nom complet", "Awa Diallo");
    saisir("Email", "awa@example.com");
    saisir("Téléphone", "06 12 34 56 78");
    await toucher(screen.getByLabelText(/conditions générales de vente/));
    await toucher(boutonValider());

    const corps = corpsCommande();
    expect(corps.mode).toBe("emporter");
    expect(Object.keys(corps.customer as Record<string, unknown>).sort()).toEqual([
      "email",
      "name",
      "phone",
    ]);
  });

  it("ne part qu'une fois, même sur un double appui", async () => {
    await monter();
    await remplirTout();
    const bouton = boutonValider();

    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await vider();

    expect(appels("/api/checkout")).toHaveLength(1);
  });
});

// ─── Espèces et plats sur commande ─────────────────────────────

describe("espèces et plats sur commande", () => {
  it("propose les espèces sur une commande du jour", async () => {
    await monter();
    expect(screen.getByRole("button", { name: /Espèces sur place/ })).toBeInTheDocument();
  });

  it("retire les espèces d'une réservation sur commande", async () => {
    /* Un gigot engage un achat chez le boucher plusieurs jours à l'avance : le
     * laisser réserver sans rien encaisser, c'est risquer de sortir la pièce
     * pour un client qui ne viendra pas. Le serveur refuse cette combinaison —
     * on retire l'option plutôt que de la faire refuser au dernier écran. */
    await monter([ligne({ name: "Gigot d'agneau", unitPriceCents: 12000, qty: 1, leadTimeHours: 48 })]);

    expect(screen.getByRole("heading", { name: /Date de retrait/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Espèces sur place/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carte bancaire/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Le moyen de paiement étant déjà corrigé, aucun blocage ne doit en parler.
    expect(blocages().join(" ")).not.toMatch(/se règlent en ligne/);
  });

  it("retient la première date proposable et l'envoie avec la commande", async () => {
    await monter([ligne({ name: "Gigot d'agneau", unitPriceCents: 12000, qty: 1, leadTimeHours: 48 })]);
    await remplirTout();
    await toucher(boutonValider());

    const corps = corpsCommande();
    expect(corps.scheduledDate).toBe(DATES_SUR_COMMANDE.days[0].date);
    expect(corps.slot).toBe(DATES_SUR_COMMANDE.days[0].slots[0]);
  });

  it("bloque et renvoie au téléphone quand aucune date n'est servable", async () => {
    routes["/api/preorder-slots"] = () => reponse({ leadTimeHours: 48, days: [] });
    await monter([ligne({ name: "Gigot d'agneau", unitPriceCents: 12000, qty: 1, leadTimeHours: 48 })]);
    await remplirTout();

    expect(blocages().join(" ")).toMatch(/Aucune date n'est disponible/);
    expect(blocages().join(" ")).toMatch(/01 60 00 00 00/);
    expect(boutonValider()).toBeDisabled();
  });
});

// ─── Échec de la validation ────────────────────────────────────

describe("quand la validation échoue", () => {
  it("laisse le panier intact et affiche l'erreur sur une coupure réseau", async () => {
    routes["/api/checkout"] = () => Promise.reject(new Error("offline"));
    await monter();
    await remplirTout();
    await toucher(boutonValider());

    expect(screen.getByRole("status").textContent).toMatch(
      /paiement est momentanément indisponible/,
    );
    // Le panier est entier : lignes affichées, et rien n'a été vidé du
    // stockage — le client réessaie sans tout recomposer.
    expect(screen.getByText(/2× Mafé bœuf/)).toBeInTheDocument();
    expect(montantAffiche("Sous-total")).toBe(SOUS_TOTAL);
    const stocke = JSON.parse(localStorage.getItem(CLE_PANIER) ?? "[]") as CartLine[];
    expect(stocke).toHaveLength(1);
    expect(stocke[0].qty).toBe(2);
    expect(sessionStorage.getItem("ots_pending_order")).toBeNull();
    // Et le bouton redevient actionnable.
    expect(boutonValider()).toBeEnabled();
  });

  it("répète le motif du serveur plutôt qu'un message générique", async () => {
    const motif = "« Mafé bœuf » n'est plus disponible en quantité suffisante (1 restant).";
    routes["/api/checkout"] = () => reponse({ error: motif }, 409);
    await monter();
    await remplirTout();
    await toucher(boutonValider());

    expect(screen.getByRole("status").textContent).toContain(motif);
    expect(screen.getByText(/2× Mafé bœuf/)).toBeInTheDocument();
  });
});

// ─── Montants affichés ─────────────────────────────────────────

/* Le récapitulatif est le dernier écran que le client lit avant de payer. Les
 * montants n'y engagent rien — le serveur recalcule tout — mais ils engagent la
 * confiance : trois lignes qui ne s'additionnent pas, et c'est l'abandon. */
describe("récapitulatif", () => {
  it("additionne juste sur une livraison ordinaire", async () => {
    await monter();
    await remplirTout();

    expect(montantAffiche("Sous-total")).toBe(SOUS_TOTAL);
    expect(montantAffiche("Frais de livraison")).toBe(ZONE.feeCents);
    expect(montantAffiche("Total TTC")).toBe(SOUS_TOTAL + ZONE.feeCents);
  });

  it("n'ajoute pas de frais à une commande à emporter", async () => {
    await monter();
    await toucher(screen.getByRole("button", { name: /À emporter/ }));

    expect(screen.getByText("À emporter", { selector: "dt" })).toBeInTheDocument();
    expect(montantAffiche("Total TTC")).toBe(SOUS_TOTAL);
  });

  it("annonce la livraison offerte au-delà du seuil, et n'en facture rien", async () => {
    routes["/api/delivery-info"] = () => reponse({ freeDeliveryThresholdCents: 2500 });
    await monter();
    await remplirTout();

    expect(montantAffiche("Frais de livraison")).toBeNaN(); // « Offerte »
    expect(screen.getByText("Offerte")).toBeInTheDocument();
    expect(montantAffiche("Total TTC")).toBe(SOUS_TOTAL);
  });

  it.fails(
    "DÉFAUT — le total facture l'estimation serveur, la ligne affiche la zone",
    async () => {
      /* Le barème à la distance donne 4,90 € pour cette adresse, le repli par
       * zones 2,50 €. `totalCents` retient l'estimation serveur (c'est la
       * bonne), mais la ligne « Frais de livraison » du récapitulatif lit
       * `zone.feeCents` sans la regarder : le client lit 25,80 + 2,50 = 30,70 €
       * et doit payer 30,70 €… sur une addition qui, telle qu'elle est écrite,
       * fait 28,30 €. Le même aveuglement frappe « Plus que X pour la livraison
       * offerte », qui ne se déclenche que si une zone correspond. */
      routes["/api/delivery-quote"] = () =>
        reponse(devis({ via: "distance", distanceKm: 6.4, feeCents: 490 }));
      await monter();
      await remplirTout();

      expect(montantAffiche("Sous-total") + montantAffiche("Frais de livraison")).toBe(
        montantAffiche("Total TTC"),
      );
    },
  );
});
