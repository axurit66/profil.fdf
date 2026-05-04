import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { adminDb } from "@/lib/firebase-admin";
import {
  isUserPremiumActive,
  parseUserExpiryMs,
} from "@/lib/user-subscription-firestore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const snap = await adminDb.collection("users").doc(uid).get();
  const data = snap.data() as Record<string, unknown> | undefined;

  const expiryMs = parseUserExpiryMs(data);
  const isPremium = isUserPremiumActive(data);

  return NextResponse.json({
    isPremium,
    expiryDate:
      expiryMs != null ? new Date(expiryMs).toISOString() : null,
    productId: data?.productId ?? null,
    source: data?.source ?? null,
  });
}
