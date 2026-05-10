import { google } from "googleapis";

export function getAndroidPublisher() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return null;
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return google.androidpublisher({ version: "v3", auth });
}

/**
 * Client Android Publisher : JSON service account si défini, sinon ADC
 * (GOOGLE_APPLICATION_CREDENTIALS, métadonnées GCE, etc.).
 */
export function getAndroidPublisherOrAdc() {
  const fromJson = getAndroidPublisher();
  if (fromJson) {
    return fromJson;
  }
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return google.androidpublisher({ version: "v3", auth });
}
