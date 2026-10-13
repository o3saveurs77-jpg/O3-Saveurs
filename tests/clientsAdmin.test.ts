import { describe, it, expect } from "vitest";
import { clientRows, matchClient } from "@/components/admin/ClientsAdmin";
import type { Order, OrderStatus } from "@/lib/types";

/* Fichier clients — agrégation des commandes.
 *
 * L'écran annonçait « 0 client · 0,00 € cumulés » quand `/api/orders` échouait,
 * faute de regarder l'indicateur d'erreur du contexte. Le bandeau d'erreur est
 * affaire de rendu ; ce qui se teste ici, c'est le calcul lui-même : sur une
 * liste vide il rend une liste vide, et sur de vraies commandes il rend des
 * cumuls justes. Les deux doivent rester distinguables à l'écran.
 */

const NOW = new Date("2026-06-08T12:00:00.000Z").getTime();
const DAY = 86_400_000;

function order(p: {
  id: string;
  email: string;
  name?: string;
  totalCents: number;
  createdAt?: number;
  status?: OrderStatus;
}): Order {
  return {
    id: p.id,
    ref: `#${p.id}`,
    invoiceNumber: null,
    ticketNumber: null,
    ticketDate: null,
    lines: [],
    mode: "livraison",
    zoneIdx: 0,
    slot: "asap",
    preorder: false,
    scheduledFor: null,
    refusalReason: "",
    customer: { name: p.name ?? "Client", email: p.email, phone: "0600000000" },
    subtotalCents: p.totalCents,
    discountCents: 0,
    feeCents: 0,
    totalCents: p.totalCents,
    vatRateBp: 1000,
    promoCode: null,
    status: p.status ?? "livree",
    paid: true,
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

describe("clientRows", () => {
  it("rend une liste vide sur une liste vide — et c'est tout ce que ça prouve", () => {
    // Un écran qui affiche ce résultat sans savoir si la lecture a abouti
    // annonce « 0 client » à un restaurant qui en a des centaines.
    expect(clientRows([])).toEqual([]);
  });

  it("regroupe les commandes d'un même client et cumule les montants", () => {
    const rows = clientRows([
      order({ id: "1", email: "laila@x.fr", name: "Laila", totalCents: 2500 }),
      order({ id: "2", email: "laila@x.fr", name: "Laila", totalCents: 1500, createdAt: NOW + DAY }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].orders).toBe(2);
    expect(rows[0].spent).toBe(4000);
    expect(rows[0].last).toBe(NOW + DAY);
  });

  it("écarte les commandes annulées du cumul", () => {
    const rows = clientRows([
      order({ id: "1", email: "a@x.fr", totalCents: 3000 }),
      order({ id: "2", email: "a@x.fr", totalCents: 9000, status: "annulee" }),
    ]);
    expect(rows[0].orders).toBe(1);
    expect(rows[0].spent).toBe(3000);
  });

  it("classe du plus gros panier cumulé au plus petit", () => {
    const rows = clientRows([
      order({ id: "1", email: "petit@x.fr", totalCents: 1000 }),
      order({ id: "2", email: "gros@x.fr", totalCents: 5000 }),
      order({ id: "3", email: "moyen@x.fr", totalCents: 2000 }),
    ]);
    expect(rows.map((r) => r.email)).toEqual(["gros@x.fr", "moyen@x.fr", "petit@x.fr"]);
  });
});

describe("matchClient", () => {
  const row = clientRows([
    order({ id: "1", email: "Jean.Dupont@Example.FR", name: "Jean Dupont", totalCents: 1000 }),
  ])[0];

  it("cherche dans le nom et l'adresse, sans tenir compte de la casse", () => {
    expect(matchClient(row, "dupont")).toBe(true);
    expect(matchClient(row, "EXAMPLE")).toBe(true);
    expect(matchClient(row, "martin")).toBe(false);
  });

  it("une recherche vide ne masque personne", () => {
    expect(matchClient(row, "")).toBe(true);
    expect(matchClient(row, "   ")).toBe(true);
  });
});
