import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Instance sans provider (edge-safe) : lit le JWT et applique `authorized`.
export const { auth: middleware } = NextAuth(authConfig);

/**
 * Le middleware protège les pages du back-office et l'espace client.
 *
 * Il ne doit **jamais** être la seule barrière : les routes `/api/*` valident
 * elles-mêmes l'appelant via `lib/guard.ts`, et `app/admin/layout.tsx` refait le
 * contrôle de rôle côté serveur. C'est le fait de n'avoir eu que cette couche —
 * qui ne couvrait pas l'API — qui rendait tout le back-office public en écriture.
 *
 * `/compte` n'est volontairement pas dans le matcher : c'est la page qui porte
 * le formulaire de connexion (`pages.signIn`), la protéger créerait une boucle
 * de redirection. Elle affiche le formulaire ou le profil selon la session, et
 * les données qu'elle consomme sont cloisonnées par l'API.
 *
 * Restent publiques par nature : le webhook Stripe (signé), les routes
 * d'authentification, et la confirmation ou désinscription newsletter,
 * atteintes depuis un email sans session.
 */
export const config = {
  matcher: ["/admin/:path*", "/livreur/:path*"],
};
