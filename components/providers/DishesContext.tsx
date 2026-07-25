"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import type { Dish } from "@/lib/menu";

interface DishesCtx {
  dishes: Dish[];
  ready: boolean;
  /** vrai quand `/api/dishes` a échoué — la carte affichée est alors incomplète */
  error: boolean;
  update: (id: string, patch: Partial<Dish>) => void;
  toggleAvailable: (id: string) => void;
  togglePopular: (id: string) => void;
  add: (dish: Omit<Dish, "id">) => void;
  remove: (id: string) => void;
  reset: () => void;
}

const Ctx = createContext<DishesCtx | null>(null);

export function DishesProvider({ children }: { children: React.ReactNode }) {
  /* L'état partait des données de seed de `lib/menu.ts` : si `/api/dishes`
   * échouait (base indisponible, `DATABASE_URL` invalide), le `catch` était vide
   * et le site continuait d'afficher la carte de démonstration **avec ses prix**
   * et des identifiants inexistants en base. On part donc d'une liste vide et
   * l'échec est signalé. */
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dishes", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDishes((await res.json()) as Dish[]);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback((id: string, patch: Partial<Dish>) => {
    setDishes((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    fetch(`/api/dishes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const toggleAvailable = useCallback(
    (id: string) =>
      setDishes((cur) => {
        const d = cur.find((x) => x.id === id);
        if (!d) return cur;
        const available = !d.available;
        fetch(`/api/dishes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ available }),
        }).catch(() => {});
        return cur.map((x) => (x.id === id ? { ...x, available } : x));
      }),
    [],
  );

  const togglePopular = useCallback(
    (id: string) =>
      setDishes((cur) => {
        const d = cur.find((x) => x.id === id);
        if (!d) return cur;
        const popular = !d.popular;
        fetch(`/api/dishes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ popular }),
        }).catch(() => {});
        return cur.map((x) => (x.id === id ? { ...x, popular } : x));
      }),
    [],
  );

  const add = useCallback(async (dish: Omit<Dish, "id">) => {
    try {
      const res = await fetch("/api/dishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dish),
      });
      if (res.ok) {
        const created = (await res.json()) as Dish;
        setDishes((cur) => [created, ...cur]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const remove = useCallback((id: string) => {
    setDishes((cur) => cur.filter((d) => d.id !== id));
    fetch(`/api/dishes/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setReady(false);
    load();
  }, [load]);

  const value = useMemo<DishesCtx>(
    () => ({ dishes, ready, error, update, toggleAvailable, togglePopular, add, remove, reset }),
    [dishes, ready, error, update, toggleAvailable, togglePopular, add, remove, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDishes() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDishes doit être utilisé dans <DishesProvider>");
  return ctx;
}
