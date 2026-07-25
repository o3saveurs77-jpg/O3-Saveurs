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
  /** prix unitaire **d'affichage**, en centimes (le serveur recalcule) */
  unitPriceCents?: number;
  note?: string;
}

interface CartData {
  lines: CartLine[];
  count: number;
  /** sous-total indicatif en centimes — le serveur recalcule tout à la commande */
  subtotalCents: number;
}

interface CartActions {
  setOpen: (v: boolean) => void;
  add: (dish: Dish, args?: AddArgs) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "ots_cart_v2";

/* Trois contextes plutôt qu'un seul : la valeur unique était recréée à chaque
 * render et contenait `open`, si bien qu'ouvrir le panier re-rendait les ~60
 * fiches plat de la carte. Les actions sont stables, les données ne changent
 * qu'avec les lignes, et l'état d'ouverture est isolé. */
const DataCtx = createContext<CartData | null>(null);
const ActionsCtx = createContext<CartActions | null>(null);
const OpenCtx = createContext<boolean>(false);

/**
 * Relit une ligne venue de `localStorage`. Le panier était rechargé sans
 * validation : un `unitPrice` négatif ou une quantité fantaisiste repartait vers
 * le serveur. Ces montants ne sont plus qu'indicatifs, mais une ligne
 * structurellement invalide est écartée pour ne pas casser l'affichage.
 */
function reviveLine(raw: unknown): CartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.dishId !== "string" || !l.dishId) return null;
  if (typeof l.name !== "string") return null;

  const qty = Number(l.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 50) return null;

  const cents = Number(l.unitPriceCents);
  const unitPriceCents = Number.isInteger(cents) && cents >= 0 ? cents : 0;

  const opts =
    l.opts && typeof l.opts === "object" && !Array.isArray(l.opts)
      ? Object.fromEntries(
          Object.entries(l.opts as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, String(v)]),
        )
      : {};

  const formule = typeof l.formule === "string" ? l.formule : null;
  const note = typeof l.note === "string" ? l.note.slice(0, 300) : "";

  return {
    key: typeof l.key === "string" && l.key ? l.key : lineKey(l.dishId, opts, formule, note),
    dishId: l.dishId,
    name: l.name,
    photo: typeof l.photo === "string" ? l.photo : null,
    unitPriceCents,
    qty,
    opts,
    formule,
    note,
  };
}

function lineKey(
  dishId: string,
  opts: Record<string, string>,
  formule: string | null,
  note: string,
): string {
  return `${dishId}|${JSON.stringify(opts)}|${formule ?? ""}|${note}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // hydratation depuis localStorage, avec validation de forme
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setLines(parsed.map(reviveLine).filter((l): l is CartLine => l !== null));
        }
      }
    } catch {
      /* panier illisible : on repart d'un panier vide plutôt que de planter */
    }
    setHydrated(true);
  }, []);

  // persistance
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* quota ou navigation privée : le panier reste en mémoire */
    }
  }, [lines, hydrated]);

  const add = useCallback((dish: Dish, args: AddArgs = {}) => {
    const { qty = 1, opts = {}, formule = null, unitPriceCents, note = "" } = args;
    const key = lineKey(dish.id, opts, formule, note);
    setLines((s) => {
      const existing = s.find((l) => l.key === key);
      if (existing) {
        return s.map((l) =>
          l.key === key ? { ...l, qty: Math.min(50, l.qty + qty) } : l,
        );
      }
      return [
        ...s,
        {
          key,
          dishId: dish.id,
          name: dish.name,
          photo: dish.photo,
          unitPriceCents: unitPriceCents ?? dish.priceCents ?? 0,
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
        : s.map((l) => (l.key === key ? { ...l, qty: Math.min(50, qty) } : l)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((s) => s.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const data = useMemo<CartData>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotalCents: lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0),
    }),
    [lines],
  );

  const actions = useMemo<CartActions>(
    () => ({ setOpen, add, setQty, remove, clear }),
    [add, setQty, remove, clear],
  );

  return (
    <DataCtx.Provider value={data}>
      <ActionsCtx.Provider value={actions}>
        <OpenCtx.Provider value={open}>{children}</OpenCtx.Provider>
      </ActionsCtx.Provider>
    </DataCtx.Provider>
  );
}

/** Actions seules — à préférer dans les composants qui n'affichent pas le panier. */
export function useCartActions(): CartActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error("useCartActions doit être utilisé dans <CartProvider>");
  return ctx;
}

export function useCart(): CartData & CartActions & { open: boolean } {
  const data = useContext(DataCtx);
  const actions = useContext(ActionsCtx);
  if (!data || !actions) throw new Error("useCart doit être utilisé dans <CartProvider>");
  const open = useContext(OpenCtx);
  return { ...data, ...actions, open };
}
