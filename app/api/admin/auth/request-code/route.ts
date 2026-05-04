import * as crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  getAllowedAdminEmails,
  hashAdminOtp,
  isAllowedAdminEmail,
} from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { isHelpMailConfigured, sendAdminOtpEmail } from "@/lib/help-mail";

export const runtime = "nodejs";

const COLLECTION = "adminOtpChallenges";
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function emailDocId(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

const GENERIC =
  "Si cette adresse est autorisée, un code vient d’être envoyé (valable 10 min).";

export async function POST(request: Request) {
  if (!isHelpMailConfigured()) {
    return NextResponse.json(
      { error: "Envoi d’e-mails non configuré sur le serveur." },
      { status: 503 }
    );
  }

  if (getAllowedAdminEmails().size === 0) {
    return NextResponse.json(
      { error: "Aucun administrateur configuré." },
      { status: 503 }
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: GENERIC });
  }

  if (!isAllowedAdminEmail(email)) {
    return NextResponse.json({ message: GENERIC });
  }

  const ref = adminDb.collection(COLLECTION).doc(emailDocId(email));
  const snap = await ref.get();
  if (snap.exists) {
    const created = snap.data()?.createdAt as Timestamp | undefined;
    const t = created?.toDate?.();
    if (t && Date.now() - t.getTime() < RESEND_COOLDOWN_MS) {
      return NextResponse.json(
        {
          error:
            "Un code a été envoyé récemment. Attendez environ une minute avant de redemander.",
        },
        { status: 429 }
      );
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const emailNorm = email.toLowerCase();

  await ref.set({
    codeHash: hashAdminOtp(emailNorm, code),
    expiresAt: Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    await sendAdminOtpEmail(email, code);
  } catch (e) {
    console.error("[admin request-code] mail", e);
    await ref.delete().catch(() => undefined);
    return NextResponse.json(
      { error: "Impossible d’envoyer l’e-mail. Réessayez plus tard." },
      { status: 502 }
    );
  }

  return NextResponse.json({ message: GENERIC });
}
