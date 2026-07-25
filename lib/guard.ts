/* Autorisation des routes API.
 *
 * Le middleware ne protège que les *pages* `/admin` : il ne couvre aucune route
 * `/api/*`. Chaque handler qui écrit ou lit des données non publiques doit donc
 * appeler un garde ci-dessous. Ne jamais compter sur le middleware seul.
 *
 * Usage :
 *   const g = await requireAdmin();
 *   if (!g.ok) return g.response;
 *   // ... g.session.user est un ADMIN
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

export interface SessionUser {
  email: string;
  name?: string | null;
  role: string;
}

type Guard =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

function deny(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.email) return null;
  return { email: u.email, name: u.name, role: (u as { role?: string }).role ?? "CLIENT" };
}

/** Réservé aux administrateurs. 401 si non connecté, 403 si connecté sans le rôle. */
export async function requireAdmin(): Promise<Guard> {
  const user = await currentUser();
  if (!user) return deny(401, "Connexion requise");
  if (user.role !== "ADMIN") return deny(403, "Accès réservé à l'administration");
  return { ok: true, user };
}

/** Réservé aux comptes connectés, quel que soit le rôle. */
export async function requireUser(): Promise<Guard> {
  const user = await currentUser();
  if (!user) return deny(401, "Connexion requise");
  return { ok: true, user };
}

/** Session éventuelle, sans exiger de connexion (commande en invité). */
export async function optionalUser(): Promise<SessionUser | null> {
  return currentUser();
}

/**
 * Un client ne peut consulter que ses propres données ; un ADMIN voit tout.
 * `ownerEmail` est l'email porté par la ressource.
 */
export function canAccess(user: SessionUser | null, ownerEmail: string | null): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return !!ownerEmail && ownerEmail.toLowerCase() === user.email.toLowerCase();
}

/** `await req.json()` sans faire tomber la route en 500 sur un corps malformé. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const notFound = (error = "Introuvable") => NextResponse.json({ error }, { status: 404 });
export const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });
export const serverError = (error = "Erreur serveur") =>
  NextResponse.json({ error }, { status: 500 });
