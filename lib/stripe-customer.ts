import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";

export async function getOrCreateStripeCustomer(
  uid: string,
  email: string | undefined
): Promise<string> {
  const ref = adminDb.collection("users").doc(uid);
  const doc = await ref.get();
  const existing = doc.data()?.stripeCustomerId as string | undefined;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { firebaseUid: uid },
  });
  await ref.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}
