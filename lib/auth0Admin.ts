/* Gestion des accès au back-office, depuis le back-office.
 *
 * Promouvoir ou rétrograder quelqu'un imposait jusqu'ici d'ouvrir le dashboard
 * Auth0, de retrouver le compte et de cocher un rôle. Ce module fait la même
 * chose depuis l'écran « Accès & rôles ».
 *
 * Auth0 reste la source de vérité : on n'écrit rien dans la table `User`, on
 * assigne et retire des rôles Auth0. La colonne `User.role` de la base
 * applicative existe encore, mais aucun contrôle d'accès ne s'y fie — deux
 * sources sur un droit d'administration finissent toujours par diverger.
 */

import "server-only";

import { managementFetch } from "@/lib/auth0Management";

/** Rôles que l'écran sait manipuler. Ceux d'Auth0 hors de cette liste sont montrés, pas touchés. */
export const MANAGED_ROLES = ["ADMIN", "CLIENT"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export function isManagedRole(v: unknown): v is ManagedRole {
  return typeof v === "string" && (MANAGED_ROLES as readonly string[]).includes(v);
}

export interface Auth0Role {
  id: string;
  name: string;
}

export interface Auth0Account {
  userId: string;
  email: string;
  name: string;
  picture: string | null;
  lastLogin: string | null;
  loginsCount: number;
  roles: string[];
}

/** Identifiants des rôles Auth0, indexés par nom. */
export async function roleIds(): Promise<Map<string, string> | { error: string }> {
  const res = await managementFetch<Auth0Role[]>("/api/v2/roles?per_page=100");
  if (!res.ok || !res.data) return { error: res.error ?? "Rôles illisibles." };
  return new Map(res.data.map((r) => [r.name.trim().toUpperCase(), r.id]));
}

/**
 * Comptes du tenant, rôles compris.
 *
 * Les rôles sont demandés compte par compte : Auth0 ne sait pas les joindre à
 * la liste des utilisateurs. C'est acceptable pour un restaurant — quelques
 * dizaines de comptes — mais ce serait à repenser au-delà de quelques
 * centaines, en partant des membres de chaque rôle plutôt que des comptes.
 */
export async function listAccounts(
  limit = 100,
): Promise<{ accounts: Auth0Account[] } | { error: string }> {
  const res = await managementFetch<
    {
      user_id: string;
      email?: string;
      name?: string;
      picture?: string;
      last_login?: string;
      logins_count?: number;
    }[]
  >(`/api/v2/users?per_page=${Math.min(limit, 100)}&sort=last_login:-1`);

  if (!res.ok || !res.data) return { error: res.error ?? "Comptes illisibles." };

  const accounts = await Promise.all(
    res.data.map(async (u) => {
      const roles = await managementFetch<{ name?: string }[]>(
        `/api/v2/users/${encodeURIComponent(u.user_id)}/roles?per_page=100`,
      );
      return {
        userId: u.user_id,
        email: u.email ?? "",
        name: u.name ?? u.email ?? u.user_id,
        picture: u.picture ?? null,
        lastLogin: u.last_login ?? null,
        loginsCount: u.logins_count ?? 0,
        roles: (roles.data ?? [])
          .map((r) => r.name?.trim().toUpperCase())
          .filter((n): n is string => !!n),
      };
    }),
  );

  return { accounts };
}

/** Comptes portant le rôle ADMIN — sert à empêcher de supprimer le dernier. */
export async function adminMembers(
  adminRoleId: string,
): Promise<{ userIds: string[] } | { error: string }> {
  const res = await managementFetch<{ user_id: string }[]>(
    `/api/v2/roles/${encodeURIComponent(adminRoleId)}/users?per_page=100`,
  );
  if (!res.ok || !res.data) return { error: res.error ?? "Membres du rôle illisibles." };
  return { userIds: res.data.map((u) => u.user_id) };
}

export async function assignRole(
  userId: string,
  roleId: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await managementFetch(`/api/v2/users/${encodeURIComponent(userId)}/roles`, {
    method: "POST",
    body: JSON.stringify({ roles: [roleId] }),
  });
  return res.ok ? { ok: true } : { error: res.error ?? "Attribution refusée." };
}

export async function removeRole(
  userId: string,
  roleId: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await managementFetch(`/api/v2/users/${encodeURIComponent(userId)}/roles`, {
    method: "DELETE",
    body: JSON.stringify({ roles: [roleId] }),
  });
  return res.ok ? { ok: true } : { error: res.error ?? "Retrait refusé." };
}
