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
   * Clever Cloud impose un `--max-old-space-size` dérivé de l'instance, et
   * cette limite vaut pour **chaque** processus Node, pas pour la machine. Next
   * compile par défaut dans un worker distinct du processus principal : deux
   * tas pour une seule mémoire physique, et le noyau en tue un. D'où le
   * « Next.js build worker exited with code: null and signal: SIGKILL », sec,
   * sans trace — une erreur de tas V8 laisse un message, le tueur du noyau non.
   *
   *  · `webpackBuildWorker: false` — compiler dans le processus principal,
   *    plutôt que d'ouvrir un second tas à côté ;
   *  · `cpus: 1` — un seul ouvrier pour la génération statique ;
   *  · `webpackMemoryOptimizations` — la variante économe de webpack.
   *
   * ⚠️ Ne pas ajouter `workerThreads: true` en croyant économiser un processus.
   * Next transmet alors la configuration aux ouvriers par clonage structuré, et
   * le `headers()` ci-dessous — une fonction — ne se clone pas : la génération
   * statique s'arrête sur « DataCloneError: ()=>null could not be cloned », qui
   * ne dit rien de sa cause. Les processus enfants, par défaut, sérialisent
   * autrement et n'ont pas ce défaut.
   *
   * Le build est plus lent, faute de parallélisme. À reconsidérer si une
   * machine de compilation dédiée est un jour activée. */
  experimental: {
    webpackMemoryOptimizations: true,
    webpackBuildWorker: false,
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

    /* Largeurs proposées dans le `srcset`.
     *
     * La liste par défaut de Next monte à 3840 px, et c'est bien ce que le site
     * servait : mesuré en production, l'accueil demandait son image d'en-tête en
     * 3840 px de large, pour 440 Ko. Personne ne regarde ce restaurant sur un
     * écran de 4 000 pixels, et surtout pas le visiteur en 4G que cette page
     * faisait attendre onze secondes.
     *
     * Plafonner à 1920 suffit à couvrir un grand écran — y compris en densité
     * double, puisque la mise en page borne le contenu à 1180 px (`.wrap`). Les
     * petites tailles sont conservées : ce sont elles que reçoit un téléphone. */
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920],

    /* Durée de conservation des images optimisées, en secondes. Trente jours :
     * une photo de plat ne change pas, et chaque reconversion coûte du calcul
     * sur une instance qui n'en a pas à revendre. */
    minimumCacheTTL: 2_592_000,
  },

  /* Redirections des URL d'un site antérieur.
   *
   * Google garde `o3saveurs.fr/accueil/` dans son index — titre « Accueil - Ô 3
   * Saveurs - Restaurant », soit une page qui n'a jamais existé dans cette
   * application. Le domaine a donc servi un autre site avant celle-ci, et cette
   * URL est aujourd'hui une 404 : le peu d'autorité qu'elle porte est perdu, et
   * un visiteur qui clique le résultat tombe sur une erreur.
   *
   * Une 301 transfère l'autorité vers l'accueil et fait disparaître l'entrée de
   * l'index au passage suivant du robot. `permanent: true` est bien ce qu'on
   * veut ici : la page ne reviendra pas.
   */
  async redirects() {
    return [
      { source: "/accueil", destination: "/", permanent: true },

      /* `/commande` tout seul n'a jamais existé : la page de suivi est
       * `/commande/<identifiant>` et le tunnel est `/commander`. L'adresse
       * courte circule pourtant — on la tape de mémoire, elle traîne dans des
       * échanges — et elle tombait sur la page d'erreur. Le `source` est exact,
       * sans joker : `/commande/<id>` doit continuer d'afficher le suivi.
       *
       * 308 et non 301 : la redirection permanente de Next conserve la méthode
       * HTTP, ce qui évite qu'un formulaire posté là se transforme en GET. */
      { source: "/commande", destination: "/commander", permanent: true },
    ];
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
