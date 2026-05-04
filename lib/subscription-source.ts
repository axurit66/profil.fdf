/** Abonnements gérés uniquement côté Stripe ou stores (pas d’action admin). */
export function isStoreOrStripeSubscriptionSource(
  source: string | null | undefined
): boolean {
  return source === "stripe" || source === "ios" || source === "android";
}
