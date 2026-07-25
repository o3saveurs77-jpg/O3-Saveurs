import { describe, it, expect } from "vitest";
import { valid, ordersByStatus, topDishes, kpis, revenueByDay } from "@/lib/analytics";
import type { Order, OrderStatus, OrderMode } from "@/lib/types";

const DAY = 86400000;
const NOW = new Date("2026-06-08T12:00:00.000Z").getTime();

function order(p: Partial<Order> & { id: string }): Order {
  return {
    id: p.id,
    ref: p.ref ?? "#REF",
    lines: p.lines ?? [],
    mode: (p.mode ?? "livraison") as OrderMode,
    zoneIdx: p.zoneIdx ?? 0,
    slot: p.slot ?? "asap",
    customer: p.customer ?? { name: "C", email: "c@x.fr", phone: "06" },
    subtotal: p.subtotal ?? 10,
    fee: p.fee ?? 0,
    total: p.total ?? 10,
    status: (p.status ?? "livree") as OrderStatus,
    paid: p.paid ?? true,
    paymentMethod: p.paymentMethod ?? "Carte",
    createdAt: p.createdAt ?? NOW,
    driver: p.driver ?? null,
  };
}

const line = (name: string, qty: number, unitPrice: number) => ({
  key: name + qty,
  dishId: name,
  name,
  photo: null,
  unitPrice,
  qty,
  opts: {},
  formule: null,
  note: "",
});

describe("valid", () => {
  it("exclut les commandes annulées", () => {
    const list = [order({ id: "1" }), order({ id: "2", status: "annulee" })];
    expect(valid(list)).toHaveLength(1);
  });
});

describe("ordersByStatus", () => {
  it("compte par statut", () => {
    const list = [
      order({ id: "1", status: "livree" }),
      order({ id: "2", status: "livree" }),
      order({ id: "3", status: "route" }),
    ];
    expect(ordersByStatus(list)).toEqual({ livree: 2, route: 1 });
  });
});

describe("topDishes", () => {
  it("agrège quantités et CA par plat, trié décroissant", () => {
    const list = [
      order({ id: "1", lines: [line("Tcheb", 2, 11), line("Mafé", 1, 12)] }),
      order({ id: "2", lines: [line("Tcheb", 3, 11)] }),
      order({ id: "3", status: "annulee", lines: [line("Tcheb", 9, 11)] }), // ignorée
    ];
    const top = topDishes(list);
    expect(top[0]).toMatchObject({ name: "Tcheb", qty: 5, ca: 55 });
    expect(top[1]).toMatchObject({ name: "Mafé", qty: 1 });
  });
});

describe("kpis", () => {
  it("calcule CA, panier moyen et taux de livraison sur commandes valides", () => {
    const list = [
      order({ id: "1", total: 20, status: "livree" }),
      order({ id: "2", total: 30, status: "route" }),
      order({ id: "3", total: 100, status: "annulee" }), // exclue
    ];
    const k = kpis(list, NOW);
    expect(k.total).toBe(2);
    expect(k.ca).toBe(50);
    expect(k.avg).toBe(25);
    expect(k.deliveryRate).toBe(50); // 1 livrée / 2
  });

  it("CA du jour ne compte que les commandes d'aujourd'hui", () => {
    const list = [
      order({ id: "1", total: 20, createdAt: NOW }),
      order({ id: "2", total: 50, createdAt: NOW - 5 * DAY }),
    ];
    const k = kpis(list, NOW);
    expect(k.caToday).toBe(20);
    expect(k.ordersToday).toBe(1);
  });
});

describe("revenueByDay", () => {
  it("retourne N points avec le CA agrégé par jour", () => {
    const list = [
      order({ id: "1", total: 20, createdAt: NOW }),
      order({ id: "2", total: 30, createdAt: NOW }),
    ];
    const series = revenueByDay(list, NOW, 7);
    expect(series).toHaveLength(7);
    const today = series[series.length - 1];
    expect(today.ca).toBe(50);
    expect(today.commandes).toBe(2);
  });
});
