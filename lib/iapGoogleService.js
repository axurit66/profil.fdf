/**
 * Vérification des abonnements Google Play (Android Publisher API) et persistance Firestore.
 * @module lib/iapGoogleService
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getAndroidPublisherOrAdc } from "@/lib/google-play";
import VerifierModule from "google-play-billing-validator";

const Verifier = VerifierModule.default ?? VerifierModule;

const LOG_PREFIX = "[iap-google]";

/**
 * Extrait email + clé PEM du JSON compte de service (pour google-play-billing-validator).
 * @returns {{ email: string, key: string } | null}
 */
function serviceAccountForVerifier() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const email = j.client_email;
    const key =
      typeof j.private_key === "string"
        ? j.private_key.replace(/\\n/g, "\n")
        : "";
    if (!email || !key) return null;
    return { email, key };
  } catch {
    return null;
  }
}

/**
 * @param {string} purchaseToken
 * @param {string} productId
 * @param {string} userId UID Firebase (logs)
 * @returns {Promise<{ isValid: boolean, productId?: string, expiresDate?: Date, orderId?: string }>}
 */
export async function verifyGoogleReceipt(purchaseToken, productId, userId) {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  if (!packageName) {
    console.error(`${LOG_PREFIX} ANDROID_PACKAGE_NAME manquant`);
    return { isValid: false };
  }

  if (!purchaseToken || typeof purchaseToken !== "string") {
    console.warn(`${LOG_PREFIX} purchaseToken absent (uid=${userId})`);
    return { isValid: false };
  }
  if (!productId || typeof productId !== "string") {
    console.warn(`${LOG_PREFIX} productId absent (uid=${userId})`);
    return { isValid: false };
  }

  const receipt = { packageName, productId, purchaseToken };
  const sa = serviceAccountForVerifier();

  /** @type {Record<string, unknown> | null} */
  let sub = null;

  if (sa) {
    const verifier = new Verifier({ email: sa.email, key: sa.key });
    try {
      const result = await verifier.verifySub(receipt);
      if (!result.isSuccessful || !result.payload) {
        console.warn(
          `${LOG_PREFIX} verifySub (uid=${userId})`,
          result.errorMessage ?? "réponse invalide"
        );
        return { isValid: false };
      }
      sub = /** @type {Record<string, unknown>} */ (result.payload);
    } catch (e) {
      const msg =
        typeof e === "object" && e !== null && "errorMessage" in e
          ? String(/** @type {{ errorMessage?: string }} */ (e).errorMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      console.warn(`${LOG_PREFIX} verifySub rejet (uid=${userId})`, msg);
      return { isValid: false };
    }
  } else {
    let publisher;
    try {
      publisher = getAndroidPublisherOrAdc();
    } catch (e) {
      console.error(`${LOG_PREFIX} initialisation client Google (ADC)`, e);
      return { isValid: false };
    }

    try {
      const res = await publisher.purchases.subscriptions.get({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });
      sub = res.data ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`${LOG_PREFIX} API subscriptions.get (uid=${userId})`, msg);
      return { isValid: false };
    }
  }

  if (!sub) {
    console.warn(`${LOG_PREFIX} réponse vide (uid=${userId})`);
    return { isValid: false };
  }

  const paymentState = sub.paymentState;
  if (paymentState !== 1) {
    console.warn(
      `${LOG_PREFIX} paymentState=${paymentState} (attendu 1) uid=${userId}`
    );
    return { isValid: false };
  }

  const expiryRaw = sub.expiryTimeMillis;
  const expiryMs =
    expiryRaw != null && expiryRaw !== ""
      ? Number(expiryRaw)
      : NaN;
  if (!Number.isFinite(expiryMs)) {
    console.warn(`${LOG_PREFIX} expiryTimeMillis invalide (uid=${userId})`);
    return { isValid: false };
  }

  const now = Date.now();
  if (expiryMs <= now) {
    console.warn(
      `${LOG_PREFIX} abonnement expiré expiryTimeMillis=${expiryMs} (uid=${userId})`
    );
    return { isValid: false };
  }

  const orderIdRaw = sub.orderId;
  const orderId =
    typeof orderIdRaw === "string" ? orderIdRaw : String(orderIdRaw ?? "");

  return {
    isValid: true,
    productId,
    expiresDate: new Date(expiryMs),
    orderId,
  };
}

/**
 * @param {string} userId
 * @param {{ isValid: boolean, productId?: string, expiresDate?: Date, orderId?: string }} verificationResult
 * @param {string} purchaseToken
 */
export async function saveGoogleSubscription(userId, verificationResult, purchaseToken) {
  if (!verificationResult.isValid || !verificationResult.expiresDate) {
    throw new Error("saveGoogleSubscription: résultat de vérification invalide");
  }

  const nowMs = Date.now();
  const expiresMs = verificationResult.expiresDate.getTime();
  const active = expiresMs > nowMs;
  const isPremium = active;
  const status = active ? "active" : "inactive";

  const updates = {
    isPremium,
    status,
    expiryDate: Timestamp.fromDate(verificationResult.expiresDate),
    productId: verificationResult.productId ?? "",
    purchaseToken,
    iapUpdatedAt: FieldValue.serverTimestamp(),
    source: "android",
  };

  await adminDb.collection("users").doc(userId).set(updates, { merge: true });
  console.info(
    `${LOG_PREFIX} Firestore users/${userId} ← isPremium=${isPremium}, status=${status}`
  );
}
