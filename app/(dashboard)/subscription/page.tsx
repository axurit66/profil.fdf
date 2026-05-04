import { requireSessionUid } from "@/lib/session-server";
import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import SubscriptionActions from "./subscription-actions";

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

  const priceList = prices.data.map((p) => {
    const product = p.product;
    const productName =
      typeof product === "object" &&
      product &&
      "name" in product &&
      typeof (product as { name?: string }).name === "string"
        ? (product as { name: string }).name
        : p.nickname || p.id;
    return {
      id: p.id,
      amount: p.unit_amount,
      currency: p.currency,
      productName,
    };
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
