import type { NextAuthConfig } from "next-auth";

/**
 * Config de base, sans provider — sûre pour l'edge runtime (middleware).
 * L'instance complète (avec Credentials + Prisma) est dans `auth.ts`.
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/compte" },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "CLIENT";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string) ?? "CLIENT";
      }
      return session;
    },
    /**
     * Utilisé par le middleware. Ne couvre que les *pages* : les routes `/api/*`
     * valident l'appelant elles-mêmes via `lib/guard.ts`, et le layout
     * `/admin` refait le contrôle de rôle côté serveur.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // `/compte` reste public : c'est la page qui porte le formulaire de
      // connexion (`pages.signIn`). La protéger créerait une boucle de
      // redirection. Elle affiche elle-même le formulaire ou le profil selon
      // la session.
      if (pathname.startsWith("/admin")) return auth?.user?.role === "ADMIN";

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
