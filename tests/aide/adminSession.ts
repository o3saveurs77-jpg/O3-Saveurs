/* Session simulée pour les tests de routes API.
 *
 * Les routes ne lisent jamais la session elles-mêmes : elles passent par
 * `lib/guard.ts`, qui appelle `auth()` depuis `@/auth`. C'est donc `@/auth`
 * qu'on neutralise — et seulement lui. Le garde reste le vrai code : c'est
 * précisément ce qu'on cherche à éprouver, et le remplacer par un double
 * reviendrait à tester le double.
 *
 * Neutraliser `@/auth` évite au passage de charger `next-auth`, Auth0 et
 * `lib/prisma` (donc `assertEnv()` et une connexion à la base de production).
 *
 * Usage, en tête de chaque fichier de test :
 *
 *   vi.mock("@/auth", async () => {
 *     const m = await import("./aide/adminSession");
 *     return { auth: m.authSimulee };
 *   });
 *
 * Le détour par `await import()` est volontaire : `vi.mock` est remonté au-dessus
 * des `import` du fichier, et une fabrique qui refermerait sur une liaison
 * importée lèverait « cannot access before initialization ».
 */

export interface UtilisateurSimule {
  email: string;
  name?: string | null;
  role: string;
}

export interface SessionSimulee {
  user: UtilisateurSimule;
}

/** Session courante, lue par `authSimulee()`. Mutée par les aides ci-dessous. */
export const etatSession: { session: SessionSimulee | null } = { session: null };

/** Remplace `auth()` de `@/auth`. */
export async function authSimulee(): Promise<SessionSimulee | null> {
  return etatSession.session;
}

/** Appelant anonyme : aucun cookie de session. */
export function sansSession(): void {
  etatSession.session = null;
}

/** Appelant connecté avec le rôle demandé. */
export function commeRole(role: string, email = `${role.toLowerCase()}@o3saveurs.fr`): void {
  etatSession.session = { user: { email, name: role, role } };
}

export const commeAdmin = (email = "laila@o3saveurs.fr") => commeRole("ADMIN", email);
export const commeClient = (email = "client@exemple.fr") => commeRole("CLIENT", email);
export const commeLivreur = (email = "livreur@o3saveurs.fr") => commeRole("LIVREUR", email);

/**
 * Session connectée **sans rôle du tout**.
 *
 * Ce n'est pas un cas de laboratoire : `currentUser()` replie sur `"CLIENT"`
 * quand le claim Auth0 manque, et c'est l'état réel d'un compte créé avant que
 * l'Action Post-Login soit branchée.
 */
export function sansRole(email = "inconnu@exemple.fr"): void {
  etatSession.session = { user: { email, name: null } } as unknown as SessionSimulee;
}

/** Session dont l'email est absent — un jeton tronqué, un provider mal configuré. */
export function sansEmail(): void {
  etatSession.session = { user: { role: "ADMIN" } } as unknown as SessionSimulee;
}
