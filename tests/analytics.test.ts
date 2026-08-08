import { describe, it, expect } from "vitest";
import {
  valid,
  collected,
  orderedCents,
  collectedCents,
  pendingCents,
  periodStats,
  trendPct,
  ordersByStatus,
  topDishes,
  revenueByDay,
  modeSplit,
  isLate,
  isAbandoned,
  LATE_AFTER_MINUTES,
  ABANDONED_AFTER_MINUTES,
} from "@/lib/analytics";
import type { Order, OrderLine, OrderStatus, OrderMode } from "@/lib/types";

const DAY = 86_400_000;
const MIN = 60_000;

/** Date fixe : les tests ne doivent jamais dépendre de l'heure courante. */
const NOW = new Date("2026-06-08T12:00:00.000Z").getTime();

function order(p: Partial<Order> & { id: string }): Order {
  return {
    id: p.id,
    ref: p.ref ?? "#REF",
    invoiceNumber: p.invoiceNumber ?? null,
    lines: p.lines ?? [],
    mode: (p.mode ?? "livraison") as OrderMode,
    zoneIdx: p.zoneIdx ?? 0,
    slot: p.slot ?? "asap",
    customer: p.customer ?? { name: "C", email: "c@x.fr", phone: "0600000000" },
    subtotalCents: p.subtotalCents ?? 1000,
    discountCents: p.discountCents ?? 0,
    feeCents: p.feeCents ?? 0,
    totalCents: p.totalCents ?? 1000,
    vatRateBp: p.vatRateBp ?? 1000,
    promoCode: p.promoCode ?? null,
    status: (p.status ?? "livree") as OrderStatus,
    paid: p.paid ?? true,
    paymentStatus: p.paymentStatus ?? "paye",
    paymentMethod: p.paymentMethod ?? "Carte bancaire",
    refundedCents: p.refundedCents ?? 0,
    creditNoteNumber: p.creditNoteNumber ?? null,
    refundReason: p.refundReason ?? "",
    cancelRequestedAt: p.cancelRequestedAt ?? null,
    cancelReason: p.cancelReason ?? "",
    createdAt: p.createdAt ?? NOW,
    driverId: p.driverId ?? null,
    driverName: p.driverName ?? null,
    deliveryRunId: p.deliveryRunId ?? null,
    runPosition: p.runPosition ?? null,
    timeline: p.timeline ?? {
      confirmedAt: null,
      cookingAt: null,
      routeAt: null,
      deliveredAt: null,
      canceledAt: null,
    },
  };
}

const line = (name: string, qty: number, unitPriceCents: number): OrderLine => ({
  dishId: name,
  name,
  photo: null,
  unitPriceCents,
  qty,
  lineTotalCents: unitPriceCents * qty,
  opts: {},
  formule: null,
  note: "",
});

describe("valid / collected", () => {
  it("exclut les commandes annulées", () => {
    const list = [order({ id: "1" }), order({ id: "2", status: "annulee" })];
    expect(valid(list)).toHaveLength(1);
  });

  it("ne retient comme encaissées que les commandes payées et non annulées", () => {
    const list = [
      order({ id: "1", paid: true }),
      order({ id: "2", paid: false }),
      order({ id: "3", paid: true, status: "annulee" }),
    ];
    expect(collected(list).map((o) => o.id)).toEqual(["1"]);
  });
});

/**
 * Le cœur du problème de l'audit : la vue d'ensemble sommait toutes les
 * commandes non annulées tandis que l'écran de facturation ne gardait que les
 * payées, sans que rien n'explique l'écart. Les deux notions sont désormais
 * nommées séparément.
 */
describe("CA commandé, encaissé et restant dû", () => {
  const list = [
    order({ id: "1", totalCents: 2000, paid: true }),
    order({ id: "2", totalCents: 3000, paid: false }),
    order({ id: "3", totalCents: 10_000, status: "annulee", paid: true }),
  ];

  it("le CA commandé compte les non annulées, payées ou non", () => {
    expect(orderedCents(list)).toBe(5000);
  });

  it("le CA encaissé ne compte que les payées", () => {
    expect(collectedCents(list)).toBe(2000);
  });

  it("le restant dû est la différence", () => {
    expect(pendingCents(list)).toBe(3000);
    expect(collectedCents(list) + pendingCents(list)).toBe(orderedCents(list));
  });
});

describe("periodStats", () => {
  it("agrège la période et calcule le taux d'annulation", () => {
    const list = [
      order({ id: "1", totalCents: 2000, paid: true, createdAt: NOW }),
      order({ id: "2", totalCents: 3000, paid: false, createdAt: NOW }),
      order({ id: "3", totalCents: 9999, status: "annulee", createdAt: NOW }),
      order({ id: "hors", totalCents: 5000, createdAt: NOW - 10 * DAY }),
    ];
    const s = periodStats(list, NOW - DAY, NOW + DAY);

    expect(s.orders).toBe(2);
    expect(s.canceled).toBe(1);
    expect(s.cancelRatePct).toBeCloseTo(33.3, 1);
    expect(s.orderedCents).toBe(5000);
    expect(s.collectedCents).toBe(2000);
    expect(s.pendingCents).toBe(3000);
    expect(s.avgBasketCents).toBe(2500);
  });

  it("ne divise pas par zéro sur une période vide", () => {
    const s = periodStats([], NOW - DAY, NOW);
    expect(s.orders).toBe(0);
    expect(s.avgBasketCents).toBe(0);
    expect(s.cancelRatePct).toBe(0);
  });
});

describe("trendPct", () => {
  it("calcule la variation en pourcentage", () => {
    expect(trendPct(150, 100)).toBe(50);
    expect(trendPct(50, 100)).toBe(-50);
  });

  /** Afficher « +100 % » parce qu'on passe de 0 à 1 commande n'informe personne. */
  it("renvoie null quand la période de référence est vide", () => {
    expect(trendPct(10, 0)).toBeNull();
  });
});

describe("ordersByStatus", () => {
  it("compte par statut et inclut les statuts absents à zéro", () => {
    const list = [
      order({ id: "1", status: "livree" }),
      order({ id: "2", status: "livree" }),
      order({ id: "3", status: "route" }),
    ];
    const counts = ordersByStatus(list);
    expect(counts.livree).toBe(2);
    expect(counts.route).toBe(1);
    expect(counts.annulee).toBe(0);
    expect(counts.en_attente_paiement).toBe(0);
  });
});

describe("topDishes", () => {
  it("agrège quantités et CA par plat, trié décroissant, annulées exclues", () => {
    const list = [
      order({ id: "1", lines: [line("Tcheb", 2, 1100), line("Mafé", 1, 1200)] }),
      order({ id: "2", lines: [line("Tcheb", 3, 1100)] }),
      order({ id: "3", status: "annulee", lines: [line("Tcheb", 9, 1100)] }),
    ];
    const top = topDishes(list);
    expect(top[0]).toMatchObject({ name: "Tcheb", qty: 5, orderedCents: 5500 });
    expect(top[1]).toMatchObject({ name: "Mafé", qty: 1, orderedCents: 1200 });
  });
});

describe("revenueByDay", () => {
  it("retourne N points, le dernier étant le jour courant", () => {
    const list = [
      order({ id: "1", totalCents: 2000, paid: true, createdAt: NOW }),
      order({ id: "2", totalCents: 3000, paid: false, createdAt: NOW }),
    ];
    const series = revenueByDay(list, NOW, 7);

    expect(series).toHaveLength(7);
    const today = series[series.length - 1]!;
    expect(today.orderedCents).toBe(5000);
    expect(today.collectedCents).toBe(2000);
    expect(today.orders).toBe(2);
  });

  it("laisse les jours sans commande à zéro", () => {
    const series = revenueByDay([order({ id: "1", createdAt: NOW })], NOW, 3);
    expect(series[0]!.orders).toBe(0);
    expect(series[0]!.orderedCents).toBe(0);
  });
});

describe("modeSplit", () => {
  it("répartit livraison et à emporter", () => {
    const list = [
      order({ id: "1", mode: "livraison", totalCents: 2000 }),
      order({ id: "2", mode: "livraison", totalCents: 1000 }),
      order({ id: "3", mode: "emporter", totalCents: 1500 }),
    ];
    const split = modeSplit(list);
    const livraison = split.find((s) => s.mode === "livraison")!;
    expect(livraison.orders).toBe(2);
    expect(livraison.orderedCents).toBe(3000);
  });
});

describe("retards et paniers abandonnés", () => {
  it("signale une commande active dépassant le seuil de retard", () => {
    const vieille = order({
      id: "1",
      status: "cuisine",
      createdAt: NOW - (LATE_AFTER_MINUTES + 5) * MIN,
    });
    const récente = order({ id: "2", status: "cuisine", createdAt: NOW - 10 * MIN });
    expect(isLate(vieille, NOW)).toBe(true);
    expect(isLate(récente, NOW)).toBe(false);
  });

  it("ne considère pas une commande livrée comme en retard", () => {
    const livrée = order({
      id: "3",
      status: "livree",
      createdAt: NOW - 10 * DAY,
    });
    expect(isLate(livrée, NOW)).toBe(false);
  });

  it("signale un panier resté en attente de paiement", () => {
    const abandonné = order({
      id: "4",
      status: "en_attente_paiement",
      paid: false,
      createdAt: NOW - (ABANDONED_AFTER_MINUTES + 5) * MIN,
    });
    expect(isAbandoned(abandonné, NOW)).toBe(true);
  });

  it("ne signale pas un paiement en cours depuis deux minutes", () => {
    const enCours = order({
      id: "5",
      status: "en_attente_paiement",
      paid: false,
      createdAt: NOW - 2 * MIN,
    });
    expect(isAbandoned(enCours, NOW)).toBe(false);
  });
});
