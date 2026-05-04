import * as crypto from "crypto";
import { NextResponse } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  getSessionSecret,
  hashAdminOtp,
  isAllowedAdminEmail,
  signAdminSession,
} from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const COLLECTION = "adminOtpChallenges";

function emailDocId(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export async function POST(request: Request) {
  try {
    getSessionSecret();
  } catch {
    return NextResponse.json(
      { error: "Configuration admin incomplète (ADMIN_SESSION_SECRET)." },
      { status: 503 }
    );
  }

  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as { email?: string; code?: string };
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!email || !code || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "E-mail ou code invalide." },
      { status: 400 }
    );
  }

  if (!isAllowedAdminEmail(email)) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
  }

  const emailNorm = email.toLowerCase();
  const ref = adminDb.collection(COLLECTION).doc(emailDocId(email));
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Code incorrect ou expiré." }, { status: 401 });
  }

  const d = snap.data()!;
  const exp = d.expiresAt as Timestamp;
  if (exp.toDate().getTime() < Date.now()) {
    await ref.delete().catch(() => undefined);
    return NextResponse.json({ error: "Code expiré. Demandez un nouveau code." }, { status: 401 });
  }

  const expected = d.codeHash as string;
  const got = hashAdminOtp(emailNorm, code);
  if (
    expected.length !== got.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))
  ) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
  }

  await ref.delete().catch(() => undefined);

  const token = signAdminSession(emailNorm);
  const res = NextResponse.json({ ok: true, email: emailNorm });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());
  return res;
}
