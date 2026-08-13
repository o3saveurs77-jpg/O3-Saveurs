/** @type {import('next').NextConfig} */

/* En-têtes de sécurité.
 *
 * Aucun n'était défini : la page de facture était encadrable (clickjacking) et
 * aucune politique ne limitait l'exfiltration en cas de XSS.
 *
 * `unsafe-inline` sur les styles est nécessaire à Tailwind et aux styles
 * injectés par Next ; `unsafe-eval` seulement en développement, pour le
 * rafraîchissement à chaud. `js.stripe.com` et `checkout.stripe.com` sont
 * requis par Stripe Checkout.
 *
 * L’hôte du stockage des photos vient de `CELLAR_ADDON_HOST`, injectée par
 * l’addon Cellar de Clever Cloud. Il doit figurer à la fois dans `img-src` et
 * dans `images.remotePatterns` : oublier l’un des deux donne des vignettes
 * vides sans le moindre message d’erreur côté serveur. En son absence — en
 * développement, par exemple — aucune autorisation n’est ajoutée : le site
 * fonctionne avec les seules photos livrées dans `public/`.
 */
const isDev = process.env.NODE_ENV !== "production";

const storageHost = (process.env.CELLAR_ADDON_HOST ?? "")
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${storageHost ? ` https://*.${storageHost}` : ""}`,
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,

  /* Compilation sur une machine d'un gigaoctet.
   *
   * Clever Cloud impose `--max-old-space-size=644` sur l'instance de
   * production, et `next build` s'y faisait tuer par le noyau au bout de deux
   * minutes — « Next.js build worker exited with code: null and signal:
   * SIGKILL », sans autre trace, ce qui ressemble à un plantage de Next.js
   * sans en être un.
   *
   * Next répartit la compilation sur un worker par cœur : c'est leur somme qui
   * dépasse la mémoire disponible, pas un seul d'entre eux. On revient donc à
   * un worker unique, dans le processus principal, et on active la variante
   * économe de webpack. Le build est plus lent — il n'a plus rien à
   * paralléliser — mais il tient dans la machine.
   *
   * À retirer le jour où une machine de compilation dédiée sera activée
   * (`clever scale --build-flavor M`) : la parallélisation redeviendra
   * gratuite. */
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: 1,
    workerThreads: false,
  },

  images: {
    remotePatterns: storageHost
      ? [
          // Photos de plats déposées sur le stockage objet (Cellar / S3)
          { protocol: "https", hostname: `*.${storageHost}` },
        ]
      : [],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Les pages porteuses de données personnelles ne doivent ni être
        // indexées ni mises en cache par un intermédiaire.
        source: "/:path(facture|commande|compte|admin)/:rest*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
