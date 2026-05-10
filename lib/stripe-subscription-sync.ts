import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { adminDb } from "./firebase-admin";

function stripeCustomerIdFromSubscription(
  sub: Stripe.Subscription
): string | null {
  const c = sub.customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "deleted" in c && c.deleted) return null;
  if (c && typeof c === "object" && "id" in c) return c.id;
  return null;
}

/** Fin de période courante (API récente : sur chaque subscription item). */
function currentPeriodEndSecFromSubscription(
  sub: Stripe.Subscription
): number | undefined {
  const items = sub.items?.data;
  if (!items?.length) return undefined;
  let max = 0;
  for (const it of items) {
    const end = it.current_period_end;
    if (typeof end === "number" && end > max) max = end;
  }
  return max > 0 ? max : undefined;
}

/** Extrait l’id produit Stripe depuis items.data[0].price.product. */
function productIdFromSubscription(sub: Stripe.Subscription): string | undefined {
  const firstItem = sub.items?.data?.[0];
  const price = firstItem?.price;
  if (!price || typeof price !== "object") return undefined;
  const p = price.product;
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && "id" in p) return (p as { id: string }).id;
  return undefined;
}

/**
 * Synchronise isPremium, status, expiryDate, productId, iapUpdatedAt et champs Stripe
 * dans users/{userId} de façon atomique (un seul set merge).
 */
export async function syncStripeSubscription(
  userId: string,
  stripeSubscription: Stripe.Subscription,
  eventType: string
): Promise<void> {
  const customerId = stripeCustomerIdFromSubscription(stripeSubscription);
  const productId = productIdFromSubscription(stripeSubscription);
  const periodEndSec = currentPeriodEndSecFromSubscription(stripeSubscription);

  let isPremium: boolean;
  let profileStatus: "active" | "inactive";
  let expiryDate: Timestamp;

  if (eventType === "customer.subscription.deleted") {
    isPremium = false;
    profileStatus = "inactive";
    expiryDate = Timestamp.now();
  } else if (eventType === "invoice.payment_failed") {
    isPremium = false;
    profileStatus = "inactive";
    expiryDate = Timestamp.now();
  } else {
    const periodEndMs =
      typeof periodEndSec === "number" ? periodEndSec * 1000 : Date.now();
    const periodStillValid = periodEndMs > Date.now();
    const stripeOk =
      stripeSubscription.status === "active" ||
      stripeSubscription.status === "trialing";
    const eligible = stripeOk && periodStillValid;
    isPremium = eligible;
    profileStatus = eligible ? "active" : "inactive";
    expiryDate = Timestamp.fromMillis(periodEndMs);
  }

  const ref = adminDb.collection("users").doc(userId);
  const updates: Record<string, unknown> = {
    isPremium,
    status: profileStatus,
    expiryDate,
    iapUpdatedAt: FieldValue.serverTimestamp(),
    source: "stripe",
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    ...(productId !== undefined ? { productId } : {}),
  };

  if (eventType === "customer.subscription.deleted") {
    updates.stripeSubscriptionId = null;
  } else {
    updates.stripeSubscriptionId = stripeSubscription.id;
  }

  await ref.set(updates, { merge: true });
}
