import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { isUserPremiumActive } from "@/lib/user-subscription-firestore";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = getAdminSessionFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const snap = await adminDb.collection("users").get();

  const premiumBySource = {
    stripe: 0,
    ios: 0,
    android: 0,
    admin: 0,
    other: 0,
  };
  let notPremiumActive = 0;

  snap.forEach((doc) => {
    const d = doc.data() as Record<string, unknown>;
    if (!isUserPremiumActive(d)) {
      notPremiumActive += 1;
      return;
    }
    const src = d.source as string | undefined;
    if (src === "stripe") premiumBySource.stripe += 1;
    else if (src === "ios") premiumBySource.ios += 1;
    else if (src === "android") premiumBySource.android += 1;
    else if (src === "admin") premiumBySource.admin += 1;
    else premiumBySource.other += 1;
  });

  let authUsersTotal = 0;
  let pageToken: string | undefined;
  do {
    const r = await adminAuth.listUsers(1000, pageToken);
    authUsersTotal += r.users.length;
    pageToken = r.pageToken;
  } while (pageToken);

  return NextResponse.json({
    authUsersTotal,
    firestoreProfiles: snap.size,
    notPremiumActive,
    premiumBySource,
    storeManagedTotal:
      premiumBySource.stripe +
      premiumBySource.ios +
      premiumBySource.android,
  });
}
