// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrdersProvider } from "@/components/providers/OrdersContext";
import { OrdersAdmin } from "@/components/admin/OrdersAdmin";
import { ClientsAdmin } from "@/components/admin/ClientsAdmin";
import { ComptaAdmin } from "@/components/admin/ComptaAdmin";
import { MAX_FETCHED_ORDERS } from "@/lib/analytics";
import type { Order, OrderLine, OrderStatus } from "@/lib/types";

/**
 * Ce que voit la cliente quand la lecture des commandes casse.
 *
 * Le défaut d'origine est le plus fourbe du back-office : `OrdersContext`, quand
 * `/api/orders` échoue, pose une liste **vide** puis annonce qu'elle est prête.
 * Les écrans qui le lisent affichaient donc exactement ce qu'ils afficheraient
 * d'un restaurant sans activité — « Aucune commande dans cette catégorie »,
 * « 0 client · 0,00 € cumulés », une ventilation TVA à zéro. Une panne de
 * réseau ressemblait à une faillite, et en plein service à une salle vide.
 *
 * Trois écrans ont été corrigés sans jamais être ouverts : ils sont derrière
 * Auth0. On éprouve ici la chaîne entière — `fetch` qui échoue, le provider qui
 * pose `error`, l'écran qui le dit — plus la troncature au-delà du plafond de
 * sécurité, et le refus des exports comptables sur une lecture en échec. Un
 * export qui ne contiendrait que ses en-têtes passerait, chez le comptable,
 * pour un mois sans activité.
 */

/* L'écran Commandes lit le filtre dans l'URL ; hors de Next.js il n'y a pas de
 * routeur à interroger. */
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

/* `OrdersProvider` n'appelle `/api/orders` qu'une fois la session connue et non
 * nulle — c'est voulu : le provider est monté dans le layout racine, et chaque
 * visiteur anonyme téléchargeait le fichier clients. On se présente donc comme
 * un administrateur connecté. */
vi.mock("@/components/providers/AuthContext", () => {
  /* Identité **stable** : `OrdersProvider` dépend de `user` dans son `useEffect`.
   * Un objet recréé à chaque appel relancerait `/api/orders` à chaque rendu, et
   * la boucle finirait par recouvrir l'erreur même qu'on cherche à éprouver. */
  const session = {
    user: { id: "u-admin", name: "Laila", email: "laila@o3saveurs.fr", role: "ADMIN" },
    ready: true,
  };
  return {
    useAuth: () => session,
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

/* ─── Commande de référence ─────────────────────────────────────────────── */

const ligne = (over: Partial<OrderLine> = {}): OrderLine => ({
  dishId: "d-thieb",
  name: "Thiéboudienne",
  photo: null,
  unitPriceCents: 1400,
  qty: 1,
  lineTotalCents: 1400,
  opts: {},
  formule: null,
  note: "",
  vatSplit: [[1000, 1400]],
  ...over,
});

function commande(p: Partial<Order> & { id: string }): Order {
  return {
    id: p.id,
    ref: p.ref ?? `#${p.id}`,
    invoiceNumber: p.invoiceNumber ?? 142,
    lines: p.lines ?? [ligne()],
    mode: "livraison",
    zoneIdx: 0,
    slot: "asap",
    preorder: false,
    scheduledFor: null,
    refusalReason: "",
    customer: p.customer ?? { name: "Awa Diop", email: "awa@exemple.fr", phone: "0600000000" },
    subtotalCents: 1400,
    discountCents: 0,
    feeCents: 0,
    totalCents: p.totalCents ?? 1400,
    vatRateBp: 1000,
    promoCode: null,
    status: (p.status ?? "livree") as OrderStatus,
    paid: p.paid ?? true,
    paymentStatus: "paye",
    paymentMethod: "Carte bancaire",
    refundedCents: 0,
    creditNoteNumber: null,
    refundedAt: null,
    refundReason: "",
    cancelRequestedAt: null,
    cancelReason: "",
    createdAt: p.createdAt ?? Date.now(),
    driverId: null,
    driverName: null,
    deliveryRunId: null,
    runPosition: null,
    timeline: {
      confirmedAt: null,
      cookingAt: null,
      routeAt: null,
      deliveredAt: null,
      canceledAt: null,
    },
  };
}

/* ─── Serveur factice ───────────────────────────────────────────────────── */

type Page = { statut?: number; corps: unknown };

let pages: Page[];
let appels: string[];

/** Une page de commandes telle que `/api/orders` la renvoie. */
const page = (orders: Order[], total = orders.length): Page => ({
  corps: { orders, total, take: 200, skip: 0 },
});

/** Lecture en échec : `fetchOrdersPage` lève, le provider pose `error`. */
const panne = (error = "Lecture des commandes impossible"): Page => ({
  statut: 503,
  corps: { error },
});

beforeEach(() => {
  pages = [];
  appels = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      appels.push(String(url));
      const p = pages.shift() ?? page([]);
      const statut = p.statut ?? 200;
      return {
        ok: statut >= 200 && statut < 300,
        status: statut,
        json: async () => p.corps,
      } as unknown as Response;
    }),
  );
  /* `downloadCsv` de ComptaAdmin crée un Blob : jsdom n'implémente pas
   * `URL.createObjectURL`. On ne clique aucun export réussi, mais mieux vaut
   * qu'un clic involontaire ne fasse pas passer un test pour une panne. */
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Rend l'écran dans le vrai provider, et attend la fin du chargement. */
async function monter(Ecran: () => React.JSX.Element, ...reponses: Page[]) {
  pages.push(...reponses);
  render(
    <OrdersProvider>
      <Ecran />
    </OrdersProvider>,
  );
  await waitFor(() => expect(screen.queryByText("Chargement…")).not.toBeInTheDocument());
}

/**
 * Deux pages pour une liste tronquée : la base en annonce 5 000, le serveur
 * n'en rend qu'une poignée. `fetchAllOrders` s'arrête sur une page vide et
 * conclut `truncated`, puisque `total` dépasse ce qu'elle a pu charger.
 */
const listeTronquee = (orders: Order[], total = 5000): Page[] => [
  page(orders, total),
  page([], total),
];

/* ════════════════════════════════════════════════════════════════════════
 * OrdersAdmin
 * ════════════════════════════════════════════════════════════════════════ */

/* L'écran le plus consulté du back-office, et celui où le mensonge coûte le
 * plus cher : « Aucune commande dans cette catégorie » en plein service, et la
 * cuisine conclut qu'il n'y a rien à préparer. */
describe("Commandes — quand la lecture échoue", () => {
  it("dit que la liste est indisponible, et n'affiche aucun compteur", async () => {
    await monter(OrdersAdmin, panne());

    expect(
      screen.getByText("Liste indisponible — les commandes n'ont pas pu être lues."),
    ).toBeInTheDocument();
    // Le défaut d'origine : ces phrases s'affichaient à la place.
    expect(screen.queryByText(/commandes? affichée/)).not.toBeInTheDocument();
    expect(screen.queryByText("Aucune commande dans cette catégorie.")).not.toBeInTheDocument();
  });

  it("explique que la liste est vide faute de réponse, pas faute de commandes", async () => {
    await monter(OrdersAdmin, panne());

    const alerte = screen.getByRole("alert");
    expect(alerte).toHaveTextContent("Les commandes n'ont pas pu être lues.");
    expect(alerte).toHaveTextContent(/pas parce qu'il n'y a pas de commande/);
  });

  it("propose « Réessayer », et la reprise affiche réellement les commandes", async () => {
    await monter(OrdersAdmin, panne());
    const avant = appels.length;

    pages.push(page([commande({ id: "o1", status: "cuisine", ref: "#A12" })]));
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

    await waitFor(() => expect(appels.length).toBeGreaterThan(avant));
    expect(await screen.findByText("#A12")).toBeInTheDocument();
    expect(
      screen.queryByText("Liste indisponible — les commandes n'ont pas pu être lues."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("distingue une vraie absence de commandes d'une panne", async () => {
    await monter(OrdersAdmin, page([]));

    expect(screen.getByText("Aucune commande dans cette catégorie.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/0 commande affichée/)).toBeInTheDocument();
  });

  it("retombe en panne si la reprise échoue elle aussi, sans annoncer une salle vide", async () => {
    await monter(OrdersAdmin, panne());
    pages.push(panne());
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Aucune commande dans cette catégorie.")).not.toBeInTheDocument();
  });
});

/* Au-delà du plafond de sécurité, les compteurs de l'en-tête ne portent que sur
 * ce qui a été chargé : « plus aucun impayé » peut vouloir dire « plus aucun
 * impayé parmi les 2 000 dernières ». */
describe("Commandes — quand la liste est tronquée", () => {
  it("annonce le plafond et prévient que les compteurs n'y portent que dessus", async () => {
    await monter(OrdersAdmin, ...listeTronquee([commande({ id: "o1" })]));

    const bandeau = screen.getByText(
      new RegExp(`5000 commandes existent.*${MAX_FETCHED_ORDERS} plus récentes`),
    );
    expect(bandeau).toHaveTextContent(/les compteurs ci-dessus ne portent que sur celles-là/);
  });

  it("ne confond pas troncature et panne : la liste reste affichée", async () => {
    await monter(OrdersAdmin, ...listeTronquee([commande({ id: "o1", status: "cuisine", ref: "#A12" })]));

    expect(screen.getByText("#A12")).toBeInTheDocument();
    expect(
      screen.queryByText("Liste indisponible — les commandes n'ont pas pu être lues."),
    ).not.toBeInTheDocument();
  });

  it("ne dit rien quand tout est chargé", async () => {
    await monter(OrdersAdmin, page([commande({ id: "o1" })]));
    expect(screen.queryByText(/plus récentes sont chargées/)).not.toBeInTheDocument();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * ClientsAdmin
 * ════════════════════════════════════════════════════════════════════════ */

/* Le fichier client est entièrement dérivé des commandes : si elles ne se
 * lisent pas, il n'y a pas de clients à montrer — ce qui n'est pas la même
 * chose que n'avoir aucun client. « 0 client · 0,00 € cumulés » est le bilan
 * d'un restaurant qui ferme. */
describe("Clients — quand la lecture échoue", () => {
  it("annonce un fichier indisponible au lieu d'un cumul à zéro", async () => {
    await monter(ClientsAdmin, panne());

    expect(
      screen.getByText("Fichier client indisponible — les commandes n'ont pas pu être lues."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cumulés/)).not.toBeInTheDocument();
  });

  it("n'affiche aucun montant : pas un seul « 0,00 € » sur l'écran", async () => {
    await monter(ClientsAdmin, panne());

    expect(document.body.textContent).not.toContain("0,00");
    expect(document.body.textContent).not.toContain("0 client");
  });

  it("ne prétend pas que le fichier est vide", async () => {
    await monter(ClientsAdmin, panne());

    expect(screen.queryByText("Aucun client enregistré pour l'instant.")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun client ne correspond à cette recherche.")).not.toBeInTheDocument();
  });

  it("dit que le tableau est vide faute de données, pas faute de clients", async () => {
    await monter(ClientsAdmin, panne());
    expect(screen.getByRole("alert")).toHaveTextContent(/vide faute de données, pas faute de clients/);
  });

  it("propose « Réessayer », et la reprise construit réellement le fichier", async () => {
    await monter(ClientsAdmin, panne());

    pages.push(page([commande({ id: "o1", totalCents: 2500 })]));
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

    expect(await screen.findByText("Awa Diop")).toBeInTheDocument();
    // `Intl` insère une espace fine insécable avant le symbole : `\s` la couvre.
    expect(screen.getByText(/^1 client · 25,00\s€ cumulés\.$/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dit « aucun client enregistré » seulement sur une lecture réussie", async () => {
    await monter(ClientsAdmin, page([]));

    expect(screen.getByText("Aucun client enregistré pour l'instant.")).toBeInTheDocument();
    expect(screen.getByText(/^0 client · 0,00\s€ cumulés\.$/)).toBeInTheDocument();
  });

  it("distingue la recherche sans résultat du fichier vide", async () => {
    await monter(ClientsAdmin, page([commande({ id: "o1" })]));

    fireEvent.change(screen.getByPlaceholderText("Rechercher un client…"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Aucun client ne correspond à cette recherche.")).toBeInTheDocument();
  });
});

describe("Clients — quand la liste est tronquée", () => {
  it("prévient que les cumuls par client sont sous-évalués", async () => {
    await monter(ClientsAdmin, ...listeTronquee([commande({ id: "o1" })]));

    expect(
      screen.getByText(new RegExp(`5000 commandes existent.*${MAX_FETCHED_ORDERS} plus récentes`)),
    ).toHaveTextContent(/Les totaux cumulés ci-dessous ne portent que sur elles/);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * ComptaAdmin
 * ════════════════════════════════════════════════════════════════════════ */

/* Ici l'erreur sort de l'écran : un CSV réduit à ses en-têtes, remis au
 * comptable, passe pour un mois sans activité — et une déclaration de TVA
 * établie dessus est fausse. Les exports doivent donc être *refusés*, pas
 * produits « au mieux ». */
describe("Compta — quand la lecture échoue", () => {
  it("annonce la panne et désactive les trois extractions", async () => {
    await monter(ComptaAdmin, panne());

    expect(screen.getByRole("alert")).toHaveTextContent("Lecture des commandes impossible.");
    for (const nom of [/Journal des ventes/, /Écritures comptables/, /Ventilation TVA/]) {
      expect(screen.getByRole("button", { name: nom })).toBeDisabled();
    }
    expect(
      screen.getByText(
        "Extractions indisponibles : corrigez la période ou relancez la lecture des commandes.",
      ),
    ).toBeInTheDocument();
  });

  it("dit « ventilation inconnue » au lieu de « aucune commande sur la période »", async () => {
    await monter(ComptaAdmin, panne());

    expect(screen.getByText("Lecture impossible — ventilation inconnue.")).toBeInTheDocument();
    expect(screen.queryByText("Aucune commande sur la période.")).not.toBeInTheDocument();
  });

  it("propose « Réessayer », et la reprise réautorise les exports", async () => {
    await monter(ComptaAdmin, panne());

    pages.push(page([commande({ id: "o1", totalCents: 2500 })]));
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Journal des ventes/ })).toBeEnabled(),
    );
    expect(screen.queryByText("Lecture impossible — ventilation inconnue.")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^25,00\s€$/).length).toBeGreaterThan(0);
  });

  it("refuse aussi les exports sur une période illisible, lecture réussie ou non", async () => {
    await monter(ComptaAdmin, page([commande({ id: "o1" })]));

    // « du » après « au » : `parisPeriodRange` rend `null`.
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-01-01" } });

    expect(await screen.findByText(/Période illisible\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ventilation TVA/ })).toBeDisabled();
    expect(screen.getByText("Période invalide.")).toBeInTheDocument();
  });

  it("refuse les exports dès qu'une borne est effacée", async () => {
    await monter(ComptaAdmin, page([commande({ id: "o1" })]));

    // Le geste normal pour retaper une date : vider le champ d'abord.
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "" } });

    expect(await screen.findByText(/Période illisible\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Journal des ventes/ })).toBeDisabled();
  });

  it("refuse les exports sur une date impossible, au lieu de la déplacer", async () => {
    await monter(ComptaAdmin, page([commande({ id: "o1" })]));

    // `Date.UTC` reporterait un 30 février sur le 2 mars sans broncher.
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-02-30" } });

    expect(await screen.findByText(/Période illisible\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Écritures comptables/ })).toBeDisabled();
  });

  it("autorise les exports quand la lecture a abouti et la période est bonne", async () => {
    await monter(ComptaAdmin, page([commande({ id: "o1" })]));

    for (const nom of [/Journal des ventes/, /Écritures comptables/, /Ventilation TVA/]) {
      expect(screen.getByRole("button", { name: nom })).toBeEnabled();
    }
    expect(screen.queryByText(/Extractions indisponibles/)).not.toBeInTheDocument();
  });

  /* DÉFAUT — les quatre tuiles de chiffres (« CA net encaissé », « Avoirs »,
   * « Panier moyen », « Factures émises ») continuent d'afficher 0,00 € et 0
   * sur une lecture en échec. Le bandeau rouge l'assume — « les totaux
   * ci-dessous sont à zéro faute de données » — mais ce sont les chiffres qu'on
   * recopie, pas le bandeau qu'on relit : une capture d'écran, un chiffre
   * dicté au téléphone ou un coup d'œil rapide en fin de mois donnent un
   * chiffre d'affaires nul. Les deux écrans voisins ont tranché dans l'autre
   * sens (Clients remplace son cumul par une phrase, Commandes supprime ses
   * compteurs) : Compta devrait faire de même, par exemple avec un « — ».
   * GRAVITÉ MOYENNE. */
  it.fails("n'affiche aucun montant à zéro quand elle n'a rien pu lire", async () => {
    await monter(ComptaAdmin, panne());

    expect(document.body.textContent).not.toContain("0,00");
  });

  /* Revers du même constat, pour documenter l'état réel. */
  it("affiche aujourd'hui des tuiles à zéro, sous le bandeau d'erreur (état actuel)", async () => {
    await monter(ComptaAdmin, panne());

    expect(screen.getAllByText(/^0,00\s€$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/les totaux ci-dessous sont à zéro/i);
  });
});

describe("Compta — quand la liste est tronquée", () => {
  it("prévient en rouge : une déclaration établie dessus serait sous-évaluée", async () => {
    await monter(ComptaAdmin, ...listeTronquee([commande({ id: "o1" })]));

    const alertes = screen.getAllByRole("alert");
    const bandeau = alertes.find((a) => a.textContent?.includes("Période incomplète."));
    expect(bandeau).toBeDefined();
    expect(bandeau).toHaveTextContent(/resserrez la période avant d'en tirer une déclaration/);
  });

  /* Les exports restent autorisés sur une liste tronquée : c'est un
   * avertissement, pas un blocage, contrairement à la lecture en échec. Ce test
   * fixe le choix actuel — le signaler sans l'interdire — pour qu'il soit
   * délibéré et non oublié. */
  it("laisse l'export possible, l'avertissement faisant foi", async () => {
    await monter(ComptaAdmin, ...listeTronquee([commande({ id: "o1" })]));

    expect(screen.getByRole("button", { name: /Ventilation TVA/ })).toBeEnabled();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * Le provider, source commune des trois écrans
 * ════════════════════════════════════════════════════════════════════════ */

/* `OrdersContext` est le point unique où une panne se transforme en liste
 * vide : si `error` n'y remontait plus, les trois écrans se remettraient à
 * mentir ensemble, et aucun test d'écran ne le dirait. */
describe("OrdersContext — la mécanique de l'erreur", () => {
  it("remet `error` à faux après une reprise réussie", async () => {
    await monter(OrdersAdmin, panne());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    pages.push(page([commande({ id: "o1", status: "cuisine", ref: "#A12" })]));
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));

    await screen.findByText("#A12");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("traite une réponse 2xx illisible comme une panne, pas comme une liste vide", async () => {
    // `json()` rend `null` : `data.orders` lève, et le provider pose `error`.
    await monter(OrdersAdmin, { corps: null });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Aucune commande dans cette catégorie.")).not.toBeInTheDocument();
  });

  it("traite un `fetch` qui lève comme une panne", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <OrdersProvider>
        <ClientsAdmin />
      </OrdersProvider>,
    );

    expect(
      await screen.findByText("Fichier client indisponible — les commandes n'ont pas pu être lues."),
    ).toBeInTheDocument();
  });
});
