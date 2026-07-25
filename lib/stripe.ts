import Stripe from "stripe";

// Client Stripe côté serveur. La clé est lue depuis STRIPE_SECRET_KEY.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

export const isStripeConfigured = () =>
  !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder");
