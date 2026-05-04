import { NextResponse } from "next/server";
import { updateSubscriptionStatus } from "@/lib/firestore";
import { findUidByAppAccountToken } from "@/lib/firestore-users";
import { decodeJwtPayload } from "@/lib/jwt-payload";

export const runtime = "nodejs";

const ACTIVE_TYPES = ["SUBSCRIBED", "DID_RENEW", "OFFER_REDEEMED"];
const EXPIRED_TYPES = [
  "EXPIRED",
  "DID_FAIL_TO_RENEW",
  "REFUND",
  "REVOKE",
];

export async function POST(request: Request) {
  try {
    let body: { signedPayload?: string };
    try {
      body = await request.json();
    } catch {
      return new NextResponse(null, { status: 200 });
    }

    const signedPayload = body.signedPayload;
    if (!signedPayload) {
      return new NextResponse(null, { status: 200 });
    }

    const outer = decodeJwtPayload<{
      notificationType?: string;
      data?: { signedTransactionInfo?: string };
    }>(signedPayload);

    const notificationType = outer.notificationType ?? "";
    const signedTransactionInfo = outer.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      console.warn("[apple webhook] signedTransactionInfo manquant");
      return new NextResponse(null, { status: 200 });
    }

    const tx = decodeJwtPayload<{
      appAccountToken?: string;
      productId?: string;
      expiresDate?: number;
    }>(signedTransactionInfo);

    const appAccountToken = tx.appAccountToken;
    if (!appAccountToken) {
      console.warn("[apple webhook] appAccountToken manquant");
      return new NextResponse(null, { status: 200 });
    }

    const uid = await findUidByAppAccountToken(appAccountToken);
    if (!uid) {
      console.warn(
        "[apple webhook] aucun utilisateur pour appAccountToken",
        appAccountToken
      );
      return new NextResponse(null, { status: 200 });
    }

    const expiresAt = tx.expiresDate;
    const productId = tx.productId ?? "";

    let status: "active" | "expired" | "canceled";
    if (ACTIVE_TYPES.includes(notificationType)) {
      status = "active";
    } else if (EXPIRED_TYPES.includes(notificationType)) {
      status = "expired";
    } else {
      status = expiresAt && expiresAt > Date.now() ? "active" : "expired";
    }

    await updateSubscriptionStatus(uid, status, {
      source: "ios",
      productId,
      expiresAt: expiresAt ?? Date.now(),
      appAccountToken,
    });
  } catch (e) {
    console.error("[apple webhook]", e);
  }

  return new NextResponse(null, { status: 200 });
}
