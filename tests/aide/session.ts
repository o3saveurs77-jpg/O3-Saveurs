/* Session simulée, pour éprouver les routes API sans Auth0.
 *
 * Aucune route n'interroge Auth0 elle-même : toutes passent par
 * `requireAdmin()`, `requireUser()` ou `optionalUser()` de `lib/guard.ts`, qui
 * appellent `auth()` de `@/auth`. Remplacer ce seul module suffit donc à se
 * présenter comme ADMIN, comme CLIENT ou comme anonyme — sans réseau, sans
 * jeton, et sans charger NextAuth (qui tire Prisma et la Management API).
 *
 * Usage, en tête d'un fichier de test — l'appel est remonté par vitest avant
 * les imports, la fabrique ne peut donc pas fermer sur une variable du test :
 *
 *   vi.mock("@/auth", async () => (await import("./aide/session")).moduleAuth());
 *
 * puis `enAdmin()`, `enClient()` ou `anonyme()` dans le test ou son `beforeEach`.
 *
 * L'état est posé sur `globalThis` et non dans une variable de module : la
 * fabrique du mock et le fichier de test importent ce fichier par deux chemins
 * différents, et deux instances d'un même module ne verraient pas la même
 * variable — la session réglée par le test n'arriverait jamais au garde.
 */

/** Ce que `lib/guard.ts` lit réellement dans la session. */
export interface UtilisateurDeTest {
  email: string;
  name?: string | null;
  /** Absent = le garde retombe sur « CLIENT ». */
  role?: string;
}

export interface SessionDeTest {
  user: UtilisateurDeTest;
}

const porteur = globalThis as typeof globalThis & {
  __o3SessionDeTest__?: SessionDeTest | null;
};

/** Comptes de référence : l'email est la seule clé qui circule jusqu'à Prisma. */
export const EMAIL_ADMIN = "laila@o3saveurs.fr";
export const EMAIL_CLIENT = "awa.diallo@example.fr";

function poser(session: SessionDeTest | null): SessionDeTest | null {
  porteur.__o3SessionDeTest__ = session;
  return session;
}

/** Session en cours, telle que la verra `auth()`. */
export function sessionActuelle(): SessionDeTest | null {
  return porteur.__o3SessionDeTest__ ?? null;
}

/**
 * Objet de remplacement du module `@/auth`.
 *
 * Seul `auth` en est importé par `lib/guard.ts` ; `handlers`, `signIn` et
 * `signOut` ne servent qu'à la route `[...nextauth]`, qu'aucun test n'appelle.
 */
export function moduleAuth(): { auth: () => Promise<SessionDeTest | null> } {
  return { auth: async () => sessionActuelle() };
}

/** Se présenter comme administrateur du restaurant. */
export function enAdmin(over: Partial<UtilisateurDeTest> = {}): SessionDeTest | null {
  return poser({ user: { email: EMAIL_ADMIN, name: "Laila", role: "ADMIN", ...over } });
}

/** Se présenter comme client connecté. */
export function enClient(over: Partial<UtilisateurDeTest> = {}): SessionDeTest | null {
  return poser({ user: { email: EMAIL_CLIENT, name: "Awa Diallo", role: "CLIENT", ...over } });
}

/** Commande en invité : aucune session. */
export function anonyme(): SessionDeTest | null {
  return poser(null);
}
