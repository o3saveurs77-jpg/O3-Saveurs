/** @type {import('next').NextConfig} */

/* En-têtes de sécurité.
 *
 * Aucun n'était défini : la page de facture était encadrable (clickjacking) et
 * aucune politique ne limitait l'exfiltration en cas de XSS.
 *
 * `unsafe-inline` sur les styles est nécessaire à Tailwind et aux styles
 * injectés par Next ; `unsafe-eval` seulement en développement, pour le
 * rafraîchissement à chaud. `js.stripe.com` et `checkout.stripe.com` sont
 * requis par Stripe Checkout, et `blob.vercel-storage.com` sert les photos.
 */
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
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

  images: {
    remotePatterns: [
      // Photos de plats uploadées sur Vercel Blob
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
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
