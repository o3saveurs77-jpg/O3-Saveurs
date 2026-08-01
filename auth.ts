import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

/**
 * Doit correspondre exactement au namespace utilisé par l'Action Auth0
 * (trigger Post-Login) qui pose ce claim — voir auth0/actions/add-role-claim.js.
 */
const ROLE_CLAIM = "https://o3saveurs.fr/role";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Auth0({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_ISSUER,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Le rôle n'est plus décidé ici : il vient d'Auth0 (Roles assignés dans le
     * dashboard + Action Post-Login, voir jwt() ci-dessous). Cette ligne `User`
     * ne sert plus qu'au profil applicatif (nom, favoris, adresses, commandes) —
     * on la crée si absente, sans jamais lui faire porter le rôle.
     */
    async signIn({ user }) {
      if (!user.email) return false;
      const email = user.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        await prisma.user.create({
          data: { email, name: user.name || email.split("@")[0] || "Client" },
        });
      }
      return true;
    },
    /**
     * `profile` (les claims du token Auth0) n'est fourni qu'à la connexion
     * initiale — le rôle reste donc figé dans le JWT jusqu'à la prochaine
     * reconnexion si on le change côté Auth0. Sans le claim (rôle non
     * assigné dans Auth0), on retombe sur CLIENT.
     */
    async jwt({ token, profile }) {
      if (profile) {
        token.role = (profile[ROLE_CLAIM] as string | undefined) ?? "CLIENT";
      }
      return token;
    },
  },
});
