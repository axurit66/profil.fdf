import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { adminDb } from "@/lib/firebase-admin";
import { updateSubscriptionStatus } from "@/lib/firestore";
import { decodeJwtPayload } from "@/lib/jwt-payload";
import { getAndroidPublisher } from "@/lib/google-play";

export const runtime = "nodejs";

type Body = {
  platform: "ios" | "android";
  purchaseToken: string;
  productId: string;
  signedTransaction?: string;
};

export async function POST(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (
    !body.platform ||
    !body.purchaseToken ||
    !body.productId ||
    (body.platform !== "ios" && body.platform !== "android")
  ) {
    return NextResponse.json(
      { error: "platform, purchaseToken et productId sont requis." },
      { status: 400 }
    );
  }

  try {
    if (body.platform === "ios") {
      if (!body.signedTransaction) {
        return NextResponse.json(
          { error: "signedTransaction requis pour iOS." },
          { status: 400 }
        );
      }
      const tx = decodeJwtPayload<{
        productId?: string;
        expiresDate?: number;
        appAccountToken?: string;
      }>(body.signedTransaction);

      const productId = tx.productId || body.productId;
      const expiresAt = tx.expiresDate;
      const appAccountToken = tx.appAccountToken;

      if (!expiresAt) {
        return NextResponse.json(
          { error: "expiresDate manquant dans la transaction." },
          { status: 400 }
        );
      }

      const updates: Record<string, unknown> = {
        purchaseToken: body.purchaseToken,
        productId,
      };
      if (appAccountToken) {
        updates.appAccountToken = appAccountToken;
      }
      await adminDb.collection("users").doc(uid).set(updates, { merge: true });

      const active = expiresAt > Date.now();
      await updateSubscriptionStatus(
        uid,
        active ? "active" : "expired",
        {
          source: "ios",
          productId,
          expiresAt,
          purchaseToken: body.purchaseToken,
          ...(appAccountToken ? { appAccountToken } : {}),
        }
      );

      return NextResponse.json({ success: true });
    }

    const pkg = process.env.ANDROID_PACKAGE_NAME;
    const publisher = getAndroidPublisher();
    if (!pkg || !publisher) {
      return NextResponse.json(
        {
          error:
            "ANDROID_PACKAGE_NAME ou GOOGLE_PLAY_SERVICE_ACCOUNT_JSON manquant.",
        },
        { status: 500 }
      );
    }

    const res = await publisher.purchases.subscriptions.get({
      packageName: pkg,
      subscriptionId: body.productId,
      token: body.purchaseToken,
    });

    const sub = res.data;
    const expiryMs = sub.expiryTimeMillis
      ? Number(sub.expiryTimeMillis)
      : null;
    const paymentState = sub.paymentState;

    const paymentOk =
      paymentState === 1 ||
      paymentState === 2;

    await adminDb
      .collection("users")
      .doc(uid)
      .set(
        {
          purchaseToken: body.purchaseToken,
          productId: body.productId,
        },
        { merge: true }
      );

    const active = Boolean(paymentOk && expiryMs && expiryMs > Date.now());

    await updateSubscriptionStatus(uid, active ? "active" : "expired", {
      source: "android",
      productId: body.productId,
      purchaseToken: body.purchaseToken,
      expiresAt: expiryMs ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur de validation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
