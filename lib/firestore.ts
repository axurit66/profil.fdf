import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

export type SubscriptionStatus = "active" | "expired" | "canceled";

export type SubscriptionSource = "stripe" | "ios" | "android" | "admin";

export type SubscriptionData = {
  productId?: string;
  expiresAt?: Date | number;
  /** Premium sans date de fin (efface expiryDate dans Firestore). */
  unlimited?: boolean;
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
    status: isPremium ? "active" : "inactive",
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
  if (data.unlimited === true) {
    updates.expiryDate = FieldValue.delete();
  } else if (data.expiresAt !== undefined) {
    const d =
      typeof data.expiresAt === "number"
        ? new Date(data.expiresAt)
        : data.expiresAt;
    updates.expiryDate = Timestamp.fromDate(d);
  }

  await adminDb.collection("users").doc(uid).set(updates, { merge: true });
}

/** Retire le statut premium côté Firestore (admin ; Stripe/IAP externes non modifiés côté prestataire). */
export async function revokePremiumAccess(uid: string): Promise<void> {
  await adminDb.collection("users").doc(uid).set(
    {
      isPremium: false,
      status: "inactive",
      expiryDate: FieldValue.delete(),
      source: FieldValue.delete(),
      productId: FieldValue.delete(),
      purchaseToken: FieldValue.delete(),
      appAccountToken: FieldValue.delete(),
      stripeSubscriptionId: FieldValue.delete(),
      iapUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
