import Stripe from "stripe";

/* Client Stripe côté serveur. La clé est lue depuis STRIPE_SECRET_KEY.
 *
 * Construit au premier usage, pas au chargement du module : depuis la v22, le
 * SDK lève dès `new Stripe("")`. Sans clé, toute route qui importait ce module
 * tombait à l'import — y compris `/api/health`, qui n'en veut que
 * `isStripeConfigured()` pour justement signaler la clé manquante. Le
 * `Proxy` garde la forme `stripe.checkout.sessions…` des appelants (et des
 * doubles de test). */
let client: Stripe | null = null;

export const stripe = new Proxy({} as Stripe, {
  get: (_cible, prop) => Reflect.get((client ??= new Stripe(process.env.STRIPE_SECRET_KEY ?? "")), prop),
});

export const isStripeConfigured = () =>
  !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder");
