import type { MetadataRoute } from "next";
import { SITE_URL, DISALLOWED_PATHS } from "@/lib/seo";

/* `/robots.txt` — il n'y en avait aucun.
 *
 * En son absence, tout est exploré : l'espace client, les factures, la tournée
 * du livreur et l'administration étaient offerts à l'exploration au même titre
 * que la carte. Les en-têtes `X-Robots-Tag` de `next.config.mjs` empêchaient
 * l'*indexation* de ces pages, pas leur *exploration* — deux choses
 * différentes, et un robot qui passe son budget d'exploration sur `/api` en a
 * d'autant moins pour la carte.
 *
 * Sur les robots d'IA : ils sont **autorisés**, délibérément. Pour un
 * restaurant, être cité par ChatGPT ou Perplexity quand on demande « où manger
 * africain à Pontault-Combault » est une visibilité gratuite, du même ordre
 * qu'un résultat Google. Les bloquer reviendrait à se retirer de ce canal.
 * Ce choix se renverse en une ligne — passer `allow` à `disallow` pour le
 * groupe concerné — si la cliente décide le contraire.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [...DISALLOWED_PATHS];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      {
        /* Robots des moteurs génératifs, cités nommément pour que
         * l'autorisation soit explicite et non le simple effet du joker. */
        userAgent: [
          "GPTBot", // ChatGPT — exploration
          "OAI-SearchBot", // ChatGPT Search
          "ChatGPT-User", // consultation à la demande d'un utilisateur
          "ClaudeBot",
          "Claude-User",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended", // Gemini / AI Overviews
          "Applebot-Extended",
          "Bingbot",
        ],
        allow: "/",
        disallow,
      },
    ],
    /* Pas de directive `Host` : c'était une extension Yandex, dépréciée depuis
     * 2018 et ignorée de Google comme de Bing. Le canonical de chaque page
     * remplit désormais ce rôle. */
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
