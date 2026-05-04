import { NextResponse } from "next/server";
import { updateSubscriptionStatus } from "@/lib/firestore";
import { findUidByPurchaseToken } from "@/lib/firestore-users";
import { getAndroidPublisher } from "@/lib/google-play";

export const runtime = "nodejs";

const ACTIVE_TYPES = [1, 2, 4, 6, 7];
const EXPIRED_TYPES = [3, 5, 12, 13];

export async function POST(request: Request) {
  try {
    let body: { message?: { data?: string } };
    try {
      body = await request.json();
    } catch {
      return new NextResponse(null, { status: 200 });
    }

    const b64 = body.message?.data;
    if (!b64) {
      return new NextResponse(null, { status: 200 });
    }

    const json = Buffer.from(b64, "base64").toString("utf8");
    const decoded = JSON.parse(json) as {
      subscriptionNotification?: {
        purchaseToken?: string;
        subscriptionId?: string;
        notificationType?: number;
      };
    };

    const subNotif = decoded.subscriptionNotification;
    const purchaseToken = subNotif?.purchaseToken;
    const subscriptionId = subNotif?.subscriptionId;
    const notificationType = subNotif?.notificationType;

    if (
      !purchaseToken ||
      !subscriptionId ||
      notificationType === undefined
    ) {
      console.warn("[google webhook] champs manquants");
      return new NextResponse(null, { status: 200 });
    }

    const uid = await findUidByPurchaseToken(purchaseToken);
    if (!uid) {
      console.warn("[google webhook] aucun user pour purchaseToken");
      return new NextResponse(null, { status: 200 });
    }

    const pkg = process.env.ANDROID_PACKAGE_NAME;
    const publisher = getAndroidPublisher();
    let expiryMs = Date.now();
    if (pkg && publisher) {
      try {
        const res = await publisher.purchases.subscriptions.get({
          packageName: pkg,
          subscriptionId,
          token: purchaseToken,
        });
        const exp = res.data.expiryTimeMillis;
        if (exp) {
          expiryMs = Number(exp);
        }
      } catch (e) {
        console.error("[google webhook] API Play", e);
      }
    }

    let status: "active" | "expired" | "canceled";
    if (ACTIVE_TYPES.includes(notificationType)) {
      status = "active";
    } else if (EXPIRED_TYPES.includes(notificationType)) {
      status = "expired";
    } else {
      status = expiryMs > Date.now() ? "active" : "expired";
    }

    await updateSubscriptionStatus(uid, status, {
      source: "android",
      productId: subscriptionId,
      purchaseToken,
      expiresAt: expiryMs,
    });
  } catch (e) {
    console.error("[google webhook]", e);
  }

  return new NextResponse(null, { status: 200 });
}
