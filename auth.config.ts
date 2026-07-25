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
    // Utilisé par le middleware pour protéger /admin.
    authorized({ auth, request }) {
      const isAdminArea = request.nextUrl.pathname.startsWith("/admin");
      if (!isAdminArea) return true;
      return auth?.user?.role === "ADMIN";
    },
  },
  providers: [],
} satisfies NextAuthConfig;
