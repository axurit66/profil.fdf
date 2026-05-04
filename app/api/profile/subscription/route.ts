import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const snap = await adminDb.collection("users").doc(uid).get();
  const data = snap.data();

  let expiryMs: number | null = null;
  const exp = data?.expiryDate;
  if (exp && typeof exp.toDate === "function") {
    expiryMs = exp.toDate().getTime();
  }

  const expiredByDate = expiryMs != null && expiryMs < Date.now();
  const isPremium = Boolean(data?.isPremium && !expiredByDate);

  return NextResponse.json({
    isPremium,
    expiryDate:
      expiryMs != null ? new Date(expiryMs).toISOString() : null,
    productId: data?.productId ?? null,
    source: data?.source ?? null,
  });
}
