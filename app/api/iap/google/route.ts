import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import {
  saveGoogleSubscription,
  verifyGoogleReceipt,
} from "@/lib/iapGoogleService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  let body: { purchaseToken?: string; productId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!body.purchaseToken || typeof body.purchaseToken !== "string") {
    return NextResponse.json(
      { error: "purchaseToken est requis." },
      { status: 400 }
    );
  }
  if (!body.productId || typeof body.productId !== "string") {
    return NextResponse.json(
      { error: "productId est requis." },
      { status: 400 }
    );
  }

  try {
    const verification = await verifyGoogleReceipt(
      body.purchaseToken,
      body.productId,
      uid
    );
    if (!verification.isValid || !verification.expiresDate) {
      return NextResponse.json(
        { error: "Vérification Google Play impossible ou rejetée." },
        { status: 400 }
      );
    }

    await saveGoogleSubscription(uid, verification, body.purchaseToken);

    const isPremium = verification.expiresDate.getTime() > Date.now();

    return NextResponse.json({
      success: true,
      isPremium,
      expiryDate: verification.expiresDate.toISOString(),
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de la validation IAP.";
    console.error("[iap/google]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
