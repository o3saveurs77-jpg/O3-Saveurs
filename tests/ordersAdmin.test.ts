import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { FILTERS, filterOrders, parseOrdersFilter } from "@/components/admin/OrdersAdmin";
import { ABANDONED_AFTER_MINUTES } from "@/lib/analytics";
import type { Order, OrderStatus } from "@/lib/types";

/* Filtres de l'écran Commandes.
 *
 * Deux défauts se rejoignaient ici : les liens « Voir » des alertes du tableau
 * de bord renvoyaient vers `?filtre=…`, que l'écran n'a jamais lu, et l'une des
 * valeurs utilisées (`abandonnes`) n'existait même pas dans ses onglets.
 * Cliquer « Voir » sur « 3 paniers abandonnés » ouvrait la liste « En cours »,
 * où ils ne figurent pas : l'alerte passait pour fausse.
 *
 * Le filtrage est désormais une fonction pure, et le contrat avec les alertes
 * est vérifié ici — le composant `Alerts` est rendu côté serveur et ne peut pas
 * importer ce module client, rien d'autre qu'un test ne peut tenir le lien.
 */

const MIN = 60_000;
const NOW = new Date("2026-06-08T19:00:00.000Z").getTime();

function order(p: Partial<Order> & { id: string }): Order {
  return {
    id: p.id,
    ref: p.ref ?? `#${p.id}`,
    invoiceNumber: null,
    ticketNumber: p.ticketNumber ?? null,
    ticketDate: null,
    lines: [],
    mode: "livraison",
    zoneIdx: 0,
    slot: "asap",
    preorder: false,
    scheduledFor: null,
    refusalReason: "",
    customer: { name: "C", email: "c@x.fr", phone: "0600000000" },
    subtotalCents: 1000,
    discountCents: 0,
    feeCents: 0,
    totalCents: 1000,
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
    createdAt: p.createdAt ?? NOW,
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

describe("parseOrdersFilter", () => {
  it("accepte les clés des onglets", () => {
    expect(parseOrdersFilter("impayees")).toBe("impayees");
    expect(parseOrdersFilter("abandonnes")).toBe("abandonnes");
    expect(parseOrdersFilter("cuisine")).toBe("cuisine");
  });

  it("ignore une valeur inconnue au lieu de vider la liste", () => {
    expect(parseOrdersFilter("nimporte-quoi")).toBeNull();
    expect(parseOrdersFilter("")).toBeNull();
    expect(parseOrdersFilter(null)).toBeNull();
  });
});

describe("filterOrders", () => {
  const enCuisine = order({ id: "cuisine", status: "cuisine" });
  const aValider = order({ id: "valider", status: "en_attente_validation" });
  const livree = order({ id: "livree", status: "livree" });
  const impayee = order({ id: "impayee", status: "confirmee", paid: false });
  const annuleeImpayee = order({ id: "annulee", status: "annulee", paid: false });
  const borne = order({ id: "borne", status: "livree", ticketNumber: 42 });
  const panierVieux = order({
    id: "vieux",
    status: "en_attente_paiement",
    paid: false,
    createdAt: NOW - (ABANDONED_AFTER_MINUTES + 5) * MIN,
  });
  const panierFrais = order({
    id: "frais",
    status: "en_attente_paiement",
    paid: false,
    createdAt: NOW - 2 * MIN,
  });

  const tout = [enCuisine, aValider, livree, impayee, annuleeImpayee, borne, panierVieux, panierFrais];
  const ids = (filter: Parameters<typeof filterOrders>[1]) =>
    filterOrders(tout, filter, NOW).map((o) => o.id);

  it("« Toutes » ne retire rien", () => {
    expect(ids("all")).toHaveLength(tout.length);
  });

  it("« En cours » garde les commandes à valider — ce sont celles qui attendent une action", () => {
    expect(ids("actives")).toEqual(["cuisine", "valider", "impayee"]);
  });

  it("« Non payées » écarte les annulées : il n'y a plus rien à encaisser dessus", () => {
    expect(ids("impayees")).toEqual(["impayee", "vieux", "frais"]);
  });

  it("« Borne » ne garde que les commandes qui portent un numéro d'attente", () => {
    expect(ids("borne")).toEqual(["borne"]);
  });

  it("« Paniers abandonnés » existe, et ne retient que ceux qui ont dépassé le délai", () => {
    // C'était le cœur du défaut : la clé n'existait pas, donc le lien de
    // l'alerte retombait sur « En cours », où ces paniers ne figurent pas.
    expect(ids("abandonnes")).toEqual(["vieux"]);
    expect(ids("actives")).not.toContain("vieux");
  });

  it("un statut brut filtre sur ce statut", () => {
    expect(ids("livree")).toEqual(["livree", "borne"]);
    expect(ids("annulee")).toEqual(["annulee"]);
  });
});

describe("contrat avec les alertes du tableau de bord", () => {
  it("chaque lien « Voir » pointe vers un filtre qui existe", () => {
    const source = readFileSync("components/admin/overview/Alerts.tsx", "utf8");
    const valeurs = [...source.matchAll(/\/admin\/commandes\?filtre=([a-z_]+)/g)].map((m) => m[1]);

    // Si ce tableau se vide, c'est que les liens ont changé de forme : le test
    // ne vérifierait plus rien en silence.
    expect(valeurs.length).toBeGreaterThan(0);
    for (const v of valeurs) {
      expect(parseOrdersFilter(v), `?filtre=${v} n'existe pas dans FILTERS`).toBe(v);
    }
  });

  it("aucune clé d'onglet n'est dupliquée", () => {
    const keys = FILTERS.map((f) => f.k);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* Impression du ticket.
 *
 * Le défaut ne se voyait qu'à l'impression, donc nulle part dans un test de
 * rendu : la racine du composant portait `print:hidden` — `display: none` en
 * média print — et le bloc ticket est son descendant. Un `display: block` ne
 * ressuscite pas un sous-arbre dont un ancêtre est masqué : l'aperçu ne
 * contenait que la barre latérale du back-office.
 *
 * On ne peut pas tester une feuille d'impression ici (jsdom ne sait pas
 * résoudre `:has()`), mais on peut tenir l'invariant qui a été cassé : aucune
 * règle d'impression ne doit masquer un ancêtre du ticket, et le point
 * d'accroche des règles globales doit exister des deux côtés.
 */
describe("ticket imprimable", () => {
  const ordersAdmin = readFileSync("components/admin/OrdersAdmin.tsx", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");

  it("le ticket porte la classe que cible la feuille d'impression", () => {
    expect(ordersAdmin).toContain('className="ticket-impression"');
    expect(globals).toContain(".ticket-impression");
  });

  it("aucun ancêtre du ticket n'est masqué à l'impression", () => {
    // `print:hidden` sur la racine du composant est exactement ce qui vidait la
    // feuille : la classe ne doit plus apparaître dans ce fichier.
    expect(ordersAdmin).not.toMatch(/className="[^"]*print:hidden/);
  });

  it("les règles d'impression sont conditionnées à la présence d'un ticket", () => {
    // Sans ce garde, elles videraient aussi l'impression de la carte ou d'une
    // facture, où aucun ticket n'existe.
    const bloc = globals.slice(globals.indexOf("@media print"));
    expect(bloc).toContain("html:has(.ticket-impression)");
    for (const ligne of bloc.split("\n")) {
      const selecteur = ligne.trim();
      if (!selecteur.endsWith("{") || selecteur.startsWith("@")) continue;
      expect(selecteur, `règle d'impression non gardée : ${selecteur}`).toContain(
        "html:has(.ticket-impression)",
      );
    }
  });
});
