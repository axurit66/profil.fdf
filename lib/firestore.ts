import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

export type SubscriptionStatus = "active" | "expired" | "canceled";

export type SubscriptionSource = "stripe" | "ios" | "android";

export type SubscriptionData = {
  productId?: string;
  expiresAt?: Date | number;
  purchaseToken?: string;
  appAccountToken?: string;
  source: SubscriptionSource;
};

export async function updateSubscriptionStatus(
  uid: string,
  status: SubscriptionStatus,
  data: SubscriptionData
): Promise<void> {
  const isPremium = status === "active";
  const updates: Record<string, unknown> = {
    isPremium,
    source: data.source,
    iapUpdatedAt: FieldValue.serverTimestamp(),
  };

  if (data.productId !== undefined) {
    updates.productId = data.productId;
  }
  if (data.purchaseToken !== undefined) {
    updates.purchaseToken = data.purchaseToken;
  }
  if (data.appAccountToken !== undefined) {
    updates.appAccountToken = data.appAccountToken;
  }
  if (data.expiresAt !== undefined) {
    const d =
      typeof data.expiresAt === "number"
        ? new Date(data.expiresAt)
        : data.expiresAt;
    updates.expiryDate = Timestamp.fromDate(d);
  }

  await adminDb.collection("users").doc(uid).set(updates, { merge: true });
}
