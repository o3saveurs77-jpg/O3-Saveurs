import type { NextAuthConfig } from "next-auth";

/**
 * Doit rester identique à `ROLE_TTL_MS` dans `auth.ts` : c'est la même
 * fraîcheur, jugée des deux côtés de la frontière edge/Node.
 */
const ROLE_TTL_MS = 5 * 60 * 1000;

/**
 * Config de base, sans provider — sûre pour l'edge runtime (middleware).
 * L'instance complète (avec Auth0 + Prisma) est dans `auth.ts`. Le rôle
 * (`token.role`) vient du claim posé par l'Action Auth0 Post-Login, voir
 * `auth0/actions/add-role-claim.js` et le callback `jwt` dans `auth.ts`.
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
        // Sert au middleware pour savoir si ce rôle mérite encore confiance.
        session.user.roleCheckedAt = (token.roleCheckedAt as number) ?? 0;
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
      /* Tournée du livreur connecté. Un ADMIN y accède aussi, pour vérifier ce
       * que ses livreurs voient sans avoir à créer un compte de test. */
      if (pathname.startsWith("/livreur")) {
        const role = auth?.user?.role;
        return role === "LIVREUR" || role === "ADMIN";
      }

      if (!pathname.startsWith("/admin")) return true;

      if (auth?.user?.role === "ADMIN") return true;
      if (!auth?.user) return false;

      /* Rôle périmé : on laisse passer, et c'est `app/admin/layout.tsx` qui
       * tranche.
       *
       * Ce n'est pas un relâchement de la garde, c'est ce qui la rend
       * praticable. Le middleware tourne sur l'edge et ne juge que le contenu
       * du cookie ; la relecture du rôle auprès d'Auth0 (voir `auth.ts`) ne
       * peut se faire que dans le runtime Node. Rediriger ici sur un jeton
       * périmé empêchait donc à jamais la relecture de s'exécuter : une
       * personne promue ADMIN pendant sa session restait dehors, et se
       * reconnecter était le seul remède — sans que rien ne le lui dise.
       *
       * Le layout `/admin` refait le contrôle côté serveur, avec le rôle
       * fraîchement relu, avant de rendre quoi que ce soit : un CLIENT est
       * renvoyé là aussi, sans avoir rien vu du back-office. */
      const checkedAt = auth.user.roleCheckedAt ?? 0;
      return Date.now() - checkedAt > ROLE_TTL_MS;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
