import Stripe from "stripe";

const secret =
  process.env.STRIPE_SECRET_KEY ||
  "sk_test_build_placeholder_only_do_not_use_runtimes";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY n'est pas défini — utilisation d'une clé factice pour le build.");
}

export const stripe = new Stripe(secret, {
  typescript: true,
});
