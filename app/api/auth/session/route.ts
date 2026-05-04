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

const FDF_AUTH_COOKIE = "fdf_auth";

/** Autorise le site WordPress (autres sous-domaines) à appeler DELETE en CORS (déconnexion). */
function corsHeadersForRequest(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin && /^https:\/\/([a-z0-9-]+\.)*feuxdeforet\.fr$/.test(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {};
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeadersForRequest(request),
      "Access-Control-Allow-Methods": "DELETE, OPTIONS, POST",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function DELETE(request: Request) {
  const res = NextResponse.json({ ok: true }, { headers: corsHeadersForRequest(request) });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(FDF_AUTH_COOKIE, "", {
    domain: ".feuxdeforet.fr",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
