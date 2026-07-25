"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { items as seedItems } from "@/lib/menu";
import type { Dish } from "@/lib/menu";

interface DishesCtx {
  dishes: Dish[];
  ready: boolean;
  update: (id: string, patch: Partial<Dish>) => void;
  toggleAvailable: (id: string) => void;
  togglePopular: (id: string) => void;
  add: (dish: Omit<Dish, "id">) => void;
  remove: (id: string) => void;
  reset: () => void;
}

const Ctx = createContext<DishesCtx | null>(null);

export function DishesProvider({ children }: { children: React.ReactNode }) {
  // seed local = rendu instantané avant la réponse API (évite l'écran vide)
  const [dishes, setDishes] = useState<Dish[]>(seedItems);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dishes", { cache: "no-store" });
      if (res.ok) setDishes(await res.json());
    } catch {
      /* garde le seed en fallback hors-ligne */
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
        if (d) {
          const available = !d.available;
          fetch(`/api/dishes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ available }),
          }).catch(() => {});
          return cur.map((x) => (x.id === id ? { ...x, available } : x));
        }
        return cur;
      }),
    []
  );

  const togglePopular = useCallback(
    (id: string) =>
      setDishes((cur) => {
        const d = cur.find((x) => x.id === id);
        if (d) {
          const popular = !d.popular;
          fetch(`/api/dishes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ popular }),
          }).catch(() => {});
          return cur.map((x) => (x.id === id ? { ...x, popular } : x));
        }
        return cur;
      }),
    []
  );

  const add = useCallback(async (dish: Omit<Dish, "id">) => {
    try {
      const res = await fetch("/api/dishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dish),
      });
      if (res.ok) {
        const created: Dish = await res.json();
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

  return (
    <Ctx.Provider
      value={{ dishes, ready, update, toggleAvailable, togglePopular, add, remove, reset }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDishes() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDishes doit être utilisé dans <DishesProvider>");
  return ctx;
}
