"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { Dish } from "@/lib/menu";

/**
 * Résultat d'une écriture : `null` si le serveur a accepté, sinon le message à
 * montrer à la cliente.
 *
 * Les quatre commandes d'écriture (`update`, `toggleAvailable`,
 * `togglePopular`, `remove`) faisaient `fetch(...).catch(() => {})` : elles ne
 * regardaient ni `res.ok`, ni le corps de la réponse. Avec une session
 * expirée, saisir 9,00 € affichait 9,00 €, la carte publique gardait 12,00 €,
 * aucun message n'apparaissait, et l'ancien prix revenait au rechargement
 * suivant — sans que rien n'ait jamais dit que l'enregistrement avait été
 * refusé. Elles rendent désormais le refus à l'appelant, et resynchronisent
 * l'écran sur la base pour que la valeur affichée soit celle qui existe.
 */
export type WriteResult = string | null;

interface DishesCtx {
  dishes: Dish[];
  ready: boolean;
  /** vrai quand `/api/dishes` a échoué — la carte affichée est alors incomplète */
  error: boolean;
  update: (id: string, patch: Partial<Dish>) => Promise<WriteResult>;
  toggleAvailable: (id: string) => Promise<WriteResult>;
  togglePopular: (id: string) => Promise<WriteResult>;
  add: (dish: Omit<Dish, "id">) => Promise<WriteResult>;
  remove: (id: string) => Promise<WriteResult>;
  reset: () => void;
}

const Ctx = createContext<DishesCtx | null>(null);

/**
 * Message pour un refus sans corps exploitable.
 *
 * Le cas le plus fréquent est la session expirée : « Modification refusée »
 * laisserait croire à une erreur de saisie, alors qu'il suffit de se
 * reconnecter. Et il est capital de dire que **rien n'a été enregistré** : la
 * cliente vient de voir sa valeur s'afficher à l'écran.
 */
function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "Votre session a expiré : reconnectez-vous. Rien n'a été enregistré.";
  }
  if (status === 404) return "Ce plat n'existe plus en base. Rien n'a été enregistré.";
  return `Le serveur a refusé la modification (erreur ${status}). Rien n'a été enregistré.`;
}

/** Appelle l'API et rend le message d'erreur du serveur, ou `null` si c'est passé. */
async function sendDish(url: string, init: RequestInit): Promise<WriteResult> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error ?? messageForStatus(res.status);
    }
    return null;
  } catch {
    return "Le serveur n'a pas répondu : la modification n'a pas été enregistrée.";
  }
}

export function DishesProvider({ children }: { children: React.ReactNode }) {
  /* L'état partait des données de seed de `lib/menu.ts` : si `/api/dishes`
   * échouait (base indisponible, `DATABASE_URL` invalide), le `catch` était vide
   * et le site continuait d'afficher la carte de démonstration **avec ses prix**
   * et des identifiants inexistants en base. On part donc d'une liste vide et
   * l'échec est signalé. */
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  /* Miroir de l'état : inverser un interrupteur demande la valeur courante du
   * plat. La lire dans un `dishes` capturé obligerait à recréer les commandes à
   * chaque changement de la carte, donc à re-rendre tous les consommateurs du
   * contexte au moindre toucher de prix. */
  const dishesRef = useRef<Dish[]>([]);
  useEffect(() => {
    dishesRef.current = dishes;
  }, [dishes]);

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

  /* Écriture optimiste — l'écran doit répondre au doigt — mais **suivie** :
   * en cas de refus on recharge la carte depuis la base plutôt que de remettre
   * une valeur devinée. La cliente voit alors réapparaître le prix réel en même
   * temps que l'explication, au lieu de le découvrir au rechargement suivant. */
  const update = useCallback(
    async (id: string, patch: Partial<Dish>): Promise<WriteResult> => {
      setDishes((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));
      const err = await sendDish(`/api/dishes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (err) await load();
      return err;
    },
    [load],
  );

  /** Bascule d'un drapeau booléen : même chemin que `update`, valeur déduite. */
  const toggleFlag = useCallback(
    async (id: string, key: "available" | "popular"): Promise<WriteResult> => {
      const dish = dishesRef.current.find((d) => d.id === id);
      if (!dish) return "Ce plat n'est plus dans la carte chargée : rechargez l'écran.";
      return update(id, { [key]: !dish[key] } as Partial<Dish>);
    },
    [update],
  );

  const toggleAvailable = useCallback((id: string) => toggleFlag(id, "available"), [toggleFlag]);
  const togglePopular = useCallback((id: string) => toggleFlag(id, "popular"), [toggleFlag]);

  const add = useCallback(async (dish: Omit<Dish, "id">): Promise<WriteResult> => {
    try {
      const res = await fetch("/api/dishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dish),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? messageForStatus(res.status);
      }
      const created = (await res.json()) as Dish;
      setDishes((cur) => [created, ...cur]);
      return null;
    } catch {
      return "Le serveur n'a pas répondu : le plat n'a pas été créé.";
    }
  }, []);

  const remove = useCallback(
    async (id: string): Promise<WriteResult> => {
      setDishes((cur) => cur.filter((d) => d.id !== id));
      const err = await sendDish(`/api/dishes/${id}`, { method: "DELETE" });
      // Le plat avait disparu de l'écran : s'il est toujours en base, il doit y
      // revenir, sinon on croit l'avoir supprimé.
      if (err) await load();
      return err;
    },
    [load],
  );

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
