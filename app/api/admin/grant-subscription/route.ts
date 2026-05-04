import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { updateSubscriptionStatus } from "@/lib/firestore";
import { isStoreOrStripeSubscriptionSource } from "@/lib/subscription-source";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = getAdminSessionFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  let body: { userEmail?: string; expiresAtIso?: string; unlimited?: boolean };
  try {
    body = (await request.json()) as {
      userEmail?: string;
      expiresAtIso?: string;
      unlimited?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const userEmail =
    typeof body.userEmail === "string" ? body.userEmail.trim() : "";
  const unlimited = body.unlimited === true;
  const expiresAtIso =
    typeof body.expiresAtIso === "string" ? body.expiresAtIso.trim() : "";

  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    return NextResponse.json(
      { error: "E-mail utilisateur invalide." },
      { status: 400 }
    );
  }

  if (!unlimited) {
    if (!expiresAtIso) {
      return NextResponse.json(
        { error: "Date d’expiration requise, ou choisissez l’illimité." },
        { status: 400 }
      );
    }
    const expiresAt = new Date(expiresAtIso);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "La date d’expiration doit être dans le futur." },
        { status: 400 }
      );
    }
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
          "Cet abonnement est géré par Stripe ou un store (App Store / Google Play) : modification impossible depuis l’administration.",
      },
      { status: 403 }
    );
  }

  if (unlimited) {
    await updateSubscriptionStatus(uid, "active", {
      source: "admin",
      unlimited: true,
      productId: "admin-grant-unlimited",
    });
    return NextResponse.json({
      ok: true,
      uid,
      email: userEmail,
      unlimited: true,
    });
  }

  const expiresAt = new Date(expiresAtIso);
  await updateSubscriptionStatus(uid, "active", {
    source: "admin",
    expiresAt,
    productId: "admin-grant",
  });

  return NextResponse.json({
    ok: true,
    uid,
    email: userEmail,
    expiresAt: expiresAt.toISOString(),
  });
}
