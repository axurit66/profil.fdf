/**
 * Vérification des achats Apple (App Store Server API) et persistance Firestore.
 * @module lib/iapAppleService
 */

import { createPrivateKey, sign } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

const LOG_PREFIX = "[iap-apple]";

const PRODUCTION_HOST = "https://api.storekit.itunes.apple.com";
const SANDBOX_HOST = "https://api.storekit-sandbox.itunes.apple.com";

/**
 * Décode le payload JSON d’un JWS (sans vérification de signature).
 * @param {string} jws
 * @returns {Record<string, unknown>}
 */
function decodeJwsPayload(jws) {
  const parts = jws.split(".");
  if (parts.length < 2) {
    throw new Error("JWT invalide");
  }
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, "base64").toString("utf8");
  return JSON.parse(json);
}

/**
 * Base64url sans padding final (JWT).
 * @param {string | Buffer} input
 */
function base64UrlEncode(input) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getBundleId() {
  return process.env.APPLE_BUNDLE_ID || process.env.IOS_BUNDLE_ID || "";
}

function getStoreKitBaseUrl() {
  if (process.env.APP_STORE_SERVER_USE_SANDBOX === "true") {
    return SANDBOX_HOST;
  }
  return PRODUCTION_HOST;
}

/**
 * JWT App Store Connect / App Store Server API (ES256), sans dépendance npm.
 * @see https://developer.apple.com/documentation/appstoreserverapi/generating_json_web_tokens_for_api_requests
 */
function createAppStoreServerApiJwt() {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const rawKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  const bundleId = getBundleId();

  if (!issuerId || !keyId || !rawKey || !bundleId) {
    throw new Error(
      "Configuration Apple incomplète (APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_PRIVATE_KEY, APPLE_BUNDLE_ID)."
    );
  }

  const privateKeyPem = rawKey.replace(/\\n/g, "\n");
  const key = createPrivateKey(privateKeyPem);

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 19 * 60,
    aud: "appstoreconnect-v1",
    bid: bundleId,
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${headerPart}.${payloadPart}`;

  const sig = sign(null, Buffer.from(unsigned, "utf8"), {
    key,
    dsaEncoding: "ieee-p1363",
  });

  return `${unsigned}.${base64UrlEncode(sig)}`;
}

/**
 * @param {string} baseUrl
 * @param {string} transactionId
 * @param {string} bearer
 */
async function fetchTransactionInfo(baseUrl, transactionId, bearer) {
  const url = `${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { res, json, text };
}

/**
 * Vérifie un JWS de transaction côté Apple (StoreKit) et extrait les infos utiles.
 *
 * @param {string} purchaseToken JWS (ex. transaction signée StoreKit 2)
 * @param {string} userId UID Firebase (logs)
 * @returns {Promise<{ isValid: boolean, productId?: string, expiresDate?: Date, originalTransactionId?: string }>}
 */
export async function verifyAppleReceipt(purchaseToken, userId) {
  const bundleIdExpected = getBundleId();
  if (!bundleIdExpected) {
    console.error(`${LOG_PREFIX} APPLE_BUNDLE_ID / IOS_BUNDLE_ID manquant`);
    return { isValid: false };
  }

  if (!purchaseToken || typeof purchaseToken !== "string") {
    console.warn(`${LOG_PREFIX} purchaseToken absent (uid=${userId})`);
    return { isValid: false };
  }

  let transactionId;
  try {
    const localPayload = decodeJwsPayload(purchaseToken);
    const tid = localPayload.transactionId;
    transactionId = typeof tid === "string" ? tid : String(tid || "");
    if (!transactionId) {
      console.warn(`${LOG_PREFIX} transactionId absent dans le JWS (uid=${userId})`);
      return { isValid: false };
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX} décodage JWS client échoué (uid=${userId})`, e);
    return { isValid: false };
  }

  let bearer;
  try {
    bearer = createAppStoreServerApiJwt();
  } catch (e) {
    console.error(`${LOG_PREFIX} JWT App Store Connect`, e);
    return { isValid: false };
  }

  const baseUrl = getStoreKitBaseUrl();
  const { res, json } = await fetchTransactionInfo(baseUrl, transactionId, bearer);

  if (!res.ok) {
    console.warn(
      `${LOG_PREFIX} API Apple HTTP ${res.status} (uid=${userId}, base=${baseUrl})`,
      typeof json === "object" ? JSON.stringify(json).slice(0, 500) : ""
    );
    return { isValid: false };
  }

  const signedInfo =
    json && typeof json.signedTransactionInfo === "string"
      ? json.signedTransactionInfo
      : null;

  if (!signedInfo) {
    console.warn(`${LOG_PREFIX} signedTransactionInfo absent (uid=${userId})`);
    return { isValid: false };
  }

  /** @type {Record<string, unknown>} */
  let tx;
  try {
    tx = decodeJwsPayload(signedInfo);
  } catch (e) {
    console.error(`${LOG_PREFIX} décodage signedTransactionInfo`, e);
    return { isValid: false };
  }

  const bundleId =
    typeof tx.bundleId === "string" ? tx.bundleId : String(tx.bundleId || "");
  if (!bundleId || bundleId !== bundleIdExpected) {
    console.warn(
      `${LOG_PREFIX} bundleId invalide: attendu=${bundleIdExpected}, reçu=${bundleId} (uid=${userId})`
    );
    return { isValid: false };
  }

  const expiresMsRaw = tx.expiresDate;
  const expiresMs =
    typeof expiresMsRaw === "number"
      ? expiresMsRaw
      : typeof expiresMsRaw === "string"
        ? Number(expiresMsRaw)
        : NaN;
  if (!Number.isFinite(expiresMs)) {
    console.warn(`${LOG_PREFIX} expiresDate manquant ou invalide (uid=${userId})`);
    return { isValid: false };
  }

  const expiresDate = new Date(expiresMs);

  const productId =
    typeof tx.productId === "string" ? tx.productId : String(tx.productId || "");
  const originalTransactionIdRaw = tx.originalTransactionId;
  const originalTransactionId =
    typeof originalTransactionIdRaw === "string"
      ? originalTransactionIdRaw
      : String(originalTransactionIdRaw || "");

  return {
    isValid: true,
    productId,
    expiresDate,
    originalTransactionId,
  };
}

/**
 * Persiste le résultat de vérification sur users/{userId}.
 *
 * @param {string} userId
 * @param {{ isValid: boolean, productId?: string, expiresDate?: Date, originalTransactionId?: string }} verificationResult
 * @param {string} purchaseToken
 */
export async function saveAppleSubscription(userId, verificationResult, purchaseToken) {
  if (!verificationResult.isValid || !verificationResult.expiresDate) {
    throw new Error("saveAppleSubscription: résultat de vérification invalide");
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
    source: "ios",
  };

  await adminDb.collection("users").doc(userId).set(updates, { merge: true });
  console.info(
    `${LOG_PREFIX} Firestore users/${userId} ← isPremium=${isPremium}, status=${status}`
  );
}
