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

  /* Types et lint : vérifiés en intégration continue, pas au déploiement.
   *
   * Une fois la compilation webpack tenue dans la mémoire de l'instance, c'est
   * l'étape « Linting and checking validity of types » qui se faisait tuer, au
   * bout de quatre minutes : `tsc` sur l'ensemble du projet coûte plus cher que
   * la compilation elle-même.
   *
   * On peut s'en passer ici parce qu'on ne s'en passe pas ailleurs :
   * `.github/workflows/ci.yml` lance `typecheck`, `lint`, les tests **et** un
   * build à chaque poussée sur `main` et à chaque pull request — sur le commit
   * exact qui part en production.
   *
   * ⚠️ Le filet est là, pas ici. Retirer ou laisser rouge cette CI, et une
   * erreur de types partirait en production sans que rien ne l'arrête. */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  /* Compilation sur une machine d'un gigaoctet.
   *
   * Clever Cloud impose `--max-old-space-size=644` — et cette limite vaut pour
   * **chaque** processus Node, pas pour la machine. Next compile par défaut
   * dans un worker distinct du processus principal : deux tas de 644 Mo pour
   * un gigaoctet de mémoire réelle, et le noyau en tue un. D'où le
   * « Next.js build worker exited with code: null and signal: SIGKILL », sec,
   * sans trace, qui ressemble à un plantage de Next.js sans en être un — une
   * erreur de tas V8 laisse un message, le tueur du noyau non.
   *
   * Tout tient donc dans un seul processus :
   *  · `webpackBuildWorker: false` — compiler dans le processus principal,
   *    plutôt que d'ouvrir un second tas à côté ;
   *  · `workerThreads: true` — la génération statique passe par des fils
   *    d'exécution et non des processus enfants, qui auraient chacun le leur ;
   *  · `cpus: 1` — un seul ouvrier, la parallélisation étant précisément ce
   *    qu'on ne peut pas se payer ;
   *  · `webpackMemoryOptimizations` — la variante économe de webpack.
   *
   * Le build est plus lent : il n'a plus rien à paralléliser. À retirer le jour
   * où une machine de compilation dédiée sera activée
   * (`clever scale --build-flavor M`). */
  experimental: {
    webpackMemoryOptimizations: true,
    webpackBuildWorker: false,
    workerThreads: true,
    cpus: 1,
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
