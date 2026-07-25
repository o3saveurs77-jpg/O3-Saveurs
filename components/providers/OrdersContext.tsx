"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import type { Order } from "@/lib/types";

interface OrdersCtx {
  orders: Order[];
  /** nombre total de commandes accessibles (la liste est paginée) */
  total: number;
  ready: boolean;
  refresh: () => Promise<void>;
  getById: (id: string) => Order | undefined;
}

/** Réponse de `GET /api/orders` — enveloppe paginée, et non plus un tableau nu. */
interface OrdersResponse {
  orders: Order[];
  total: number;
  take: number;
  skip: number;
}

const Ctx = createContext<OrdersCtx | null>(null);

/**
 * Liste des commandes visibles par l'utilisateur **connecté**.
 *
 * Ce provider appelait `/api/orders` sans condition au montage, et il est monté
 * dans le layout racine : le navigateur de chaque visiteur anonyme téléchargeait
 * donc tout le fichier clients dès la page d'accueil. La route exige désormais
 * une session et cloisonne les résultats ; côté client, on ne l'appelle plus
 * qu'une fois la session connue et non nulle.
 *
 * Les mutations (`setStatus`, `assignDriver`) ont disparu : faire avancer une
 * commande est réservé à l'administration, via `PATCH /api/orders/[id]` protégé
 * par `requireAdmin()`. La page de suivi client écrivait en base toutes les
 * 12 secondes et faisait passer les commandes en « Livrée » en 36 s.
 */
export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as OrdersResponse;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setTotal(Number(data.total) || 0);
      } else {
        setOrders([]);
        setTotal(0);
      }
    } catch {
      setOrders([]);
      setTotal(0);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      // Visiteur anonyme : aucune requête, et surtout aucune donnée client.
      setOrders([]);
      setTotal(0);
      setReady(true);
      return;
    }
    refresh();
  }, [authReady, user, refresh]);

  const getById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);

  const value = useMemo<OrdersCtx>(
    () => ({ orders, total, ready, refresh, getById }),
    [orders, total, ready, refresh, getById],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrders() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrders doit être utilisé dans <OrdersProvider>");
  return ctx;
}
