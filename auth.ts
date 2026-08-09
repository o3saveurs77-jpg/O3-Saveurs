import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";
import { prisma } from "@/lib/prisma";
import { fetchAuth0Role } from "@/lib/auth0Roles";
import { roleFromIdToken } from "@/lib/idTokenRole";
import { authConfig } from "./auth.config";

/**
 * Doit correspondre exactement au namespace utilisé par l'Action Auth0
 * (trigger Post-Login) qui pose ce claim — voir auth0/actions/add-role-claim.js.
 */
const ROLE_CLAIM = "https://o3saveurs.fr/role";

/** Doit rester aligné sur `KNOWN_ROLES` du trigger et de `lib/auth0Roles.ts`. */
const KNOWN_ROLES: readonly string[] = ["ADMIN", "LIVREUR", "CLIENT"];

/**
 * Durée de validité du rôle mémorisé dans le jeton de session.
 *
 * Passé ce délai, le rôle est relu auprès d'Auth0. Cinq minutes est le
 * compromis retenu : c'est la fenêtre pendant laquelle un accès retiré reste
 * exploitable, et c'est assez long pour qu'une session active ne déclenche
 * qu'une poignée d'appels à la Management API par heure.
 */
const ROLE_TTL_MS = 5 * 60 * 1000;

/** Nouvelle tentative rapprochée quand Auth0 n'a pas répondu. */
const ROLE_RETRY_MS = 60 * 1000;

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
     * initiale. S'en contenter figeait le rôle pour toute la durée de la
     * session : retirer ADMIN à quelqu'un dans Auth0 ne lui retirait rien du
     * tout tant qu'il ne se déconnectait pas — soit, en pratique, jamais.
     *
     * Le rôle est donc relu auprès d'Auth0 toutes les `ROLE_TTL_MS`. Une
     * réponse d'Auth0 fait foi, y compris « plus aucun rôle » qui rétrograde
     * en CLIENT. En revanche une **absence** de réponse ne rétrograde rien :
     * une panne réseau ne doit pas fermer le back-office à la gérante en plein
     * service. On réessaie simplement plus tôt.
     */
    async jwt({ token, profile, account }) {
      if (account || profile) {
        /* Le claim est lu **dans l'ID token** en priorité : c'est là que
         * l'Action Post-Login l'écrit (`api.idToken.setCustomClaim`). `profile`
         * vient de l'endpoint `/userinfo`, qui ne renvoie pas nécessairement
         * les claims personnalisés — s'y fier seul rendait tout le monde
         * CLIENT en silence, trigger correct et rôle bien assigné compris. */
        const fromIdToken = roleFromIdToken(account?.id_token, ROLE_CLAIM, KNOWN_ROLES);
        const raw = profile?.[ROLE_CLAIM];
        const fromProfile = typeof raw === "string" ? raw.trim().toUpperCase() : null;

        token.role =
          fromIdToken ??
          (fromProfile && KNOWN_ROLES.includes(fromProfile) ? fromProfile : null) ??
          "CLIENT";
        token.roleCheckedAt = Date.now();

        if (token.role === "CLIENT" && !fromIdToken && !fromProfile) {
          /* Ni l'ID token ni /userinfo ne portent le claim : l'Action n'est pas
           * branchée au flow Login, ou son namespace diffère de `ROLE_CLAIM`.
           * `npm run auth0:check` répond en dix lignes. */
          console.warn(
            `[auth] aucun claim « ${ROLE_CLAIM} » à la connexion de ${token.sub} — ` +
              "rôle CLIENT par défaut. Vérifier l'Action Post-Login (npm run auth0:check).",
          );
        }

        return token;
      }

      // `sub` porte l'identifiant Auth0 du compte (« auth0|… »), seule clé
      // acceptée par la Management API.
      if (!token.sub) return token;

      const checkedAt = typeof token.roleCheckedAt === "number" ? token.roleCheckedAt : 0;
      if (Date.now() - checkedAt < ROLE_TTL_MS) return token;

      const current = await fetchAuth0Role(token.sub);
      if (current) {
        token.role = current;
        token.roleCheckedAt = Date.now();
      } else {
        token.roleCheckedAt = Date.now() - ROLE_TTL_MS + ROLE_RETRY_MS;
      }

      return token;
    },
  },
});
