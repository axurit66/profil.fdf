import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME, SESSION_EXPIRES_IN_MS } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const idToken = body.idToken;
  if (!idToken) {
    return NextResponse.json({ error: "idToken manquant." }, { status: 400 });
  }

  try {
    await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Token invalide." }, { status: 401 });
  }

  const expiresIn = SESSION_EXPIRES_IN_MS;
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(expiresIn / 1000),
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
