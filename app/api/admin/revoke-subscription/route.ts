import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { revokePremiumAccess } from "@/lib/firestore";
import { isStoreOrStripeSubscriptionSource } from "@/lib/subscription-source";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = getAdminSessionFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  let body: { userEmail?: string };
  try {
    body = (await request.json()) as { userEmail?: string };
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const userEmail =
    typeof body.userEmail === "string" ? body.userEmail.trim() : "";
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    return NextResponse.json(
      { error: "E-mail utilisateur invalide." },
      { status: 400 }
    );
  }

  let uid: string;
  try {
    const user = await adminAuth.getUserByEmail(userEmail);
    uid = user.uid;
  } catch {
    return NextResponse.json(
      { error: "Aucun compte Firebase avec cet e-mail." },
      { status: 404 }
    );
  }

  const existing = await adminDb.collection("users").doc(uid).get();
  const src = existing.data()?.source as string | undefined;
  if (isStoreOrStripeSubscriptionSource(src)) {
    return NextResponse.json(
      {
        error:
          "Abonnement géré par Stripe ou un store : annulation impossible depuis l’administration.",
      },
      { status: 403 }
    );
  }

  await revokePremiumAccess(uid);

  return NextResponse.json({ ok: true, uid, email: userEmail });
}
