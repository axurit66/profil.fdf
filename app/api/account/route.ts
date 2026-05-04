import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * Suppression du compte : Auth + document Firestore `users/{uid}`.
 * Abonnements Stripe : à résilier côté Stripe / portail si besoin.
 */
export async function DELETE(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  try {
    await adminDb.collection("users").doc(uid).delete();
  } catch (e) {
    console.error("[api/account] firestore delete", e);
  }

  try {
    await adminAuth.deleteUser(uid);
  } catch (e) {
    console.error("[api/account] auth delete", e);
    return NextResponse.json(
      { error: "Impossible de supprimer le compte. Réessayez." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
