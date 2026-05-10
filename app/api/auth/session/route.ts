import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { adminAuth } from "@/lib/firebase-admin";
import { SESSION_ID_HEADER } from "@/lib/require-valid-session";
import { SESSION_COOKIE_NAME, SESSION_EXPIRES_IN_MS } from "@/lib/session";
import {
  sessionService,
  type SessionAuthProvider,
  type SessionPlatform,
} from "@/lib/session-service";

export const runtime = "nodejs";

function sessionCookieSecure(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  const first = forwarded?.split(",")[0]?.trim().toLowerCase();
  if (first === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

const SESSION_PLATFORMS: SessionPlatform[] = ["web", "android", "ios"];

function isSessionPlatform(v: unknown): v is SessionPlatform {
  return (
    typeof v === "string" &&
    (SESSION_PLATFORMS as readonly string[]).includes(v)
  );
}

const SESSION_PROVIDERS: SessionAuthProvider[] = [
  "email",
  "google",
  "apple",
  "facebook",
];

function isSessionAuthProvider(v: unknown): v is SessionAuthProvider {
  return (
    typeof v === "string" &&
    (SESSION_PROVIDERS as readonly string[]).includes(v)
  );
}

function isDeviceInfo(
  v: unknown
): v is string | Record<string, unknown> {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return true;
  if (typeof v === "object" && !Array.isArray(v)) return true;
  return false;
}

/** Connexion web classique : cookie de session Firebase (`idToken` dans le corps). */
async function postSessionCookie(request: Request, idToken: string) {
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
    secure: sessionCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(expiresIn / 1000),
  });
  return res;
}

/** Enregistrement Firestore d’une session appareil (Bearer + corps JSON). */
async function postDeviceSession(request: Request, body: Record<string, unknown>) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;

  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return NextResponse.json({ error: "sessionId manquant ou invalide." }, { status: 400 });
  }

  if (!isSessionPlatform(body.platform)) {
    return NextResponse.json(
      { error: "platform invalide (web, android, ios)." },
      { status: 400 }
    );
  }

  if (!isDeviceInfo(body.deviceInfo)) {
    return NextResponse.json(
      { error: "deviceInfo manquant ou invalide." },
      { status: 400 }
    );
  }

  if (!isSessionAuthProvider(body.provider)) {
    return NextResponse.json(
      { error: "provider invalide (email, google, apple, facebook)." },
      { status: 400 }
    );
  }

  const result = await sessionService.createSession(
    auth.uid,
    sessionId.trim(),
    body.platform,
    body.deviceInfo,
    body.provider
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    revokedSessionId: result.revokedSessionId,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const idToken = body.idToken;
  if (typeof idToken === "string" && idToken.length > 0) {
    return postSessionCookie(request, idToken);
  }

  return postDeviceSession(request, body);
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
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Session-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** Révoque la session Firestore (Bearer + X-Session-Id) ou déconnexion cookie (comportement historique). */
async function deleteDeviceSession(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const sessionId = request.headers.get(SESSION_ID_HEADER)?.trim() ?? "";

  if (!token || !sessionId) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const ok = await sessionService.revokeSession(decoded.uid, sessionId);
    if (!ok) {
      return NextResponse.json(
        { error: "Impossible de révoquer la session." },
        { status: 500, headers: corsHeadersForRequest(request) }
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: corsHeadersForRequest(request) }
    );
  } catch (e) {
    console.error("[api/auth/session] DELETE revoke", e);
    return NextResponse.json(
      { error: "Token invalide." },
      { status: 401, headers: corsHeadersForRequest(request) }
    );
  }
}

export async function DELETE(request: Request) {
  const deviceRes = await deleteDeviceSession(request);
  if (deviceRes) return deviceRes;

  const res = NextResponse.json({ ok: true }, { headers: corsHeadersForRequest(request) });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: sessionCookieSecure(request),
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
