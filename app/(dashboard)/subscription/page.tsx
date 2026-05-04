import type Stripe from "stripe";
import { requireSessionUid } from "@/lib/session-server";
import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import SubscriptionActions from "./subscription-actions";

/** Prix utilisable à la vente : prix actif + produit étendu actif (pas archivé). */
function isPurchasablePrice(p: Stripe.Price): boolean {
  if (!p.active) return false;
  const prod = p.product;
  if (typeof prod === "string") return false;
  if ("deleted" in prod && prod.deleted) return false;
  return (prod as Stripe.Product).active === true;
}

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const uid = await requireSessionUid();
  const userDoc = await adminDb.collection("users").doc(uid).get();
  const data = userDoc.data();

  const prices = await stripe.prices.list({
    active: true,
    type: "recurring",
    limit: 24,
    expand: ["data.product"],
  });

  type Row = {
    id: string;
    amount: number | null;
    currency: string;
    productName: string;
    productDescription: string | null;
    interval: string | null;
    intervalCount: number;
  };

  const priceList: Row[] = prices.data.filter(isPurchasablePrice).map((p) => {
    const product = p.product;
    const productObj =
      typeof product === "object" && product && "name" in product
        ? (product as {
            name?: string;
            description?: string | null;
          })
        : null;
    const productName =
      (productObj?.name && String(productObj.name)) ||
      p.nickname ||
      p.id;
    const productDescription =
      productObj?.description != null && String(productObj.description).trim() !== ""
        ? String(productObj.description).trim()
        : null;
    return {
      id: p.id,
      amount: p.unit_amount,
      currency: p.currency,
      productName,
      productDescription,
      interval: p.recurring?.interval ?? null,
      intervalCount: p.recurring?.interval_count ?? 1,
    };
  });

  priceList.sort((a, b) => {
    const order = (iv: string | null) =>
      iv === "year" ? 2 : iv === "month" ? 0 : iv === "week" ? 1 : 3;
    const diff = order(a.interval) - order(b.interval);
    if (diff !== 0) return diff;
    return (a.amount ?? 0) - (b.amount ?? 0);
  });

  const sp = await searchParams;
  const checkoutSuccess = sp.success === "true";

  return (
    <SubscriptionActions
      checkoutSuccess={checkoutSuccess}
      userSub={{
        source: data?.source,
        isPremium: data?.isPremium,
        stripeCustomerId: data?.stripeCustomerId,
        stripeSubscriptionId: data?.stripeSubscriptionId,
      }}
      prices={priceList}
    />
  );
}
