"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { Dish } from "@/lib/menu";
import type { CartLine } from "@/lib/types";

export type { CartLine };

interface AddArgs {
  qty?: number;
  opts?: Record<string, string>;
  formule?: string | null;
  unitPrice?: number;
  note?: string;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (dish: Dish, args?: AddArgs) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "ots_cart_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // hydratation depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // persistance
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, hydrated]);

  const add = useCallback((dish: Dish, args: AddArgs = {}) => {
    const { qty = 1, opts = {}, formule = null, unitPrice, note = "" } = args;
    const key = `${dish.id}|${JSON.stringify(opts)}|${formule ?? ""}|${note}`;
    setLines((s) => {
      const existing = s.find((l) => l.key === key);
      if (existing) {
        return s.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      }
      return [
        ...s,
        {
          key,
          dishId: dish.id,
          name: dish.name,
          photo: dish.photo,
          unitPrice: unitPrice ?? dish.price ?? 0,
          qty,
          opts,
          formule,
          note,
        },
      ];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setLines((s) =>
      qty <= 0
        ? s.filter((l) => l.key !== key)
        : s.map((l) => (l.key === key ? { ...l, qty } : l))
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((s) => s.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    [lines]
  );

  const value: CartCtx = {
    lines,
    count,
    subtotal,
    open,
    setOpen,
    add,
    setQty,
    remove,
    clear,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart doit être utilisé dans <CartProvider>");
  return ctx;
}
