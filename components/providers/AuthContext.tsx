"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { signIn, signOut } from "next-auth/react";
import type { MockUser, SavedAddress } from "@/lib/types";

type AuthResult = { ok: boolean; error?: string };

interface AuthCtx {
  user: MockUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  update: (patch: Partial<MockUser>) => void;
  toggleFavorite: (dishId: string) => void;
  addAddress: (a: Omit<SavedAddress, "id">) => void;
  removeAddress: (id: string) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

async function fetchMe(): Promise<MockUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (res.ok) return (await res.json()) as MockUser | null;
  } catch {
    /* ignore */
  }
  return null;
}

async function persist(patch: Partial<MockUser>) {
  try {
    await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [ready, setReady] = useState(false);

  // hydrate la session courante
  useEffect(() => {
    (async () => {
      setUser(await fetchMe());
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) return { ok: false, error: "Email ou mot de passe incorrect." };
    setUser(await fetchMe());
    return { ok: true };
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? "Inscription impossible." };
      }
      // connexion automatique après inscription
      return login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    await signOut({ redirect: false });
    setUser(null);
  }, []);

  // mises à jour optimistes + persistance serveur
  const update = useCallback((patch: Partial<MockUser>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
    persist(patch);
  }, []);

  const toggleFavorite = useCallback((dishId: string) => {
    setUser((u) => {
      if (!u) return u;
      const favorites = u.favorites.includes(dishId)
        ? u.favorites.filter((f) => f !== dishId)
        : [...u.favorites, dishId];
      persist({ favorites });
      return { ...u, favorites };
    });
  }, []);

  const addAddress = useCallback((a: Omit<SavedAddress, "id">) => {
    setUser((u) => {
      if (!u) return u;
      const addresses = [...u.addresses, { ...a, id: "a" + Date.now() }];
      persist({ addresses });
      return { ...u, addresses };
    });
  }, []);

  const removeAddress = useCallback((id: string) => {
    setUser((u) => {
      if (!u) return u;
      const addresses = u.addresses.filter((x) => x.id !== id);
      persist({ addresses });
      return { ...u, addresses };
    });
  }, []);

  return (
    <Ctx.Provider
      value={{ user, ready, login, register, logout, update, toggleFavorite, addAddress, removeAddress }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
