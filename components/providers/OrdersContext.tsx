"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { fetchAllOrders } from "@/lib/analytics";
import type { Order } from "@/lib/types";

interface OrdersCtx {
  orders: Order[];
  /** nombre total de commandes accessibles (peut dépasser `orders.length` si `truncated`) */
  total: number;
  ready: boolean;
  /** vrai quand `/api/orders` a échoué — la liste affichée est alors incomplète ou vide */
  error: boolean;
  /** vrai si le plafond de sécurité (`MAX_FETCHED_ORDERS`) a coupé la liste avant `total` */
  truncated: boolean;
  refresh: () => Promise<void>;
  getById: (id: string) => Order | undefined;
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
  const [error, setError] = useState(false);
  const [truncated, setTruncated] = useState(false);

  /* `/api/orders` sans `take` ne renvoyait que la première page (50 lignes,
   * la plus récente d'abord) : au-delà, une facture, un client ou une commande
   * en cuisine plus ancienne que les 50 dernières disparaissait silencieusement
   * des écrans qui lisent ce contexte (admin comme espace client). `fetchAllOrders`
   * reconstitue l'historique complet, page après page, jusqu'au plafond de
   * sécurité `MAX_FETCHED_ORDERS`. */
  const refresh = useCallback(async () => {
    try {
      const data = await fetchAllOrders();
      setOrders(data.orders);
      setTotal(data.total);
      setTruncated(data.truncated);
      setError(false);
    } catch {
      setOrders([]);
      setTotal(0);
      setTruncated(false);
      setError(true);
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
      setError(false);
      setTruncated(false);
      setReady(true);
      return;
    }
    refresh();
  }, [authReady, user, refresh]);

  const getById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);

  const value = useMemo<OrdersCtx>(
    () => ({ orders, total, ready, error, truncated, refresh, getById }),
    [orders, total, ready, error, truncated, refresh, getById],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrders() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrders doit être utilisé dans <OrdersProvider>");
  return ctx;
}
