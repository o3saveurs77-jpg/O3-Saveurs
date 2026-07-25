"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Order, OrderStatus, OrderMode, OrderCustomer, CartLine } from "@/lib/types";

interface CreateArgs {
  lines: CartLine[];
  mode: OrderMode;
  zoneIdx: number | null;
  slot: "asap" | string;
  customer: OrderCustomer;
  subtotal: number;
  fee: number;
  paymentMethod: string;
}

interface OrdersCtx {
  orders: Order[];
  ready: boolean;
  refresh: () => Promise<void>;
  create: (args: CreateArgs) => Promise<Order | null>;
  getById: (id: string) => Order | undefined;
  setStatus: (id: string, status: OrderStatus) => void;
  assignDriver: (id: string, driver: string | null) => void;
}

const Ctx = createContext<OrdersCtx | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (res.ok) setOrders(await res.json());
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (args: CreateArgs): Promise<Order | null> => {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) return null;
      const order: Order = await res.json();
      setOrders((cur) => [order, ...cur]);
      return order;
    } catch {
      return null;
    }
  }, []);

  const getById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);

  const patch = useCallback((id: string, body: Partial<{ status: OrderStatus; driver: string | null }>) => {
    setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, ...body } : o)));
    fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, []);

  const setStatus = useCallback((id: string, status: OrderStatus) => patch(id, { status }), [patch]);
  const assignDriver = useCallback((id: string, driver: string | null) => patch(id, { driver }), [patch]);

  return (
    <Ctx.Provider value={{ orders, ready, refresh, create, getById, setStatus, assignDriver }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrders doit être utilisé dans <OrdersProvider>");
  return ctx;
}
