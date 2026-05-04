import { adminDb } from "@/lib/firebase-admin";

export async function findUidByStripeCustomerId(
  customerId: string
): Promise<string | null> {
  const snap = await adminDb
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

export async function findUidByAppAccountToken(
  token: string
): Promise<string | null> {
  const snap = await adminDb
    .collection("users")
    .where("appAccountToken", "==", token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

export async function findUidByPurchaseToken(
  token: string
): Promise<string | null> {
  const snap = await adminDb
    .collection("users")
    .where("purchaseToken", "==", token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}
