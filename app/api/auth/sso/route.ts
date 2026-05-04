import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FDF_AUTH_COOKIE = "fdf_auth";

function getSecret(): string {
  const s = process.env.SSO_COOKIE_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("SSO_COOKIE_SECRET manquant ou trop court (32+ caractères).");
  }
  return s;
}

function getWordpressBaseUrl(): string {
  const u = process.env.WORDPRESS_URL?.trim() || "https://feuxdeforet.fr";
  return u.replace(/\/$/, "");
}

/** URL de retour autorisée après pose du cookie (même site feuxdeforet). */
function isAllowedWordPressReturnUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") {
      return false;
    }
    const host = u.hostname.toLowerCase();
    return host === "feuxdeforet.fr" || host.endsWith(".feuxdeforet.fr");
  } catch {
    return false;
  }
}

/**
 * Préserve `?redirect=` WordPress : après login, revenir sur /api/auth/sso?redirect=… puis redirection WP.
 */
function redirectToLogin(req: NextRequest): NextResponse {
  const returnToSso = new URL("/api/auth/sso", req.url);
  const wpRedirect = req.nextUrl.searchParams.get("redirect");
  if (wpRedirect) {
    returnToSso.searchParams.set("redirect", wpRedirect);
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", returnToSso.pathname + returnToSso.search);
  return NextResponse.redirect(loginUrl);
}

export async function GET(req: NextRequest) {
  let secret: string;
  try {
    secret = getSecret();
  } catch (e) {
    console.error("[api/auth/sso]", e);
    return NextResponse.json(
      { error: "Configuration SSO incomplète côté serveur." },
      { status: 500 }
    );
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return redirectToLogin(req);
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return redirectToLogin(req);
  }

  const doc = await adminDb.collection("users").doc(uid).get();
  const data = doc.data();
  const rawExp = data?.expiryDate;
  const expiryDate =
    rawExp instanceof Timestamp
      ? rawExp.toDate()
      : undefined;

  const isPremium =
    data?.isPremium === true &&
    (!expiryDate || expiryDate.getTime() > Date.now());

  const level: "premium" | "free" = isPremium ? "premium" : "free";
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = expiryDate
    ? Math.floor(expiryDate.getTime() / 1000)
    : nowSec + 60 * 60 * 24 * 30;

  const payload = JSON.stringify({ uid, level, exp });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("hex");
  const cookieValue = `${payloadB64}.${signature}`;

  const wordPressUrl = getWordpressBaseUrl();
  const redirectParam = req.nextUrl.searchParams.get("redirect");
  let redirectUrl = wordPressUrl;
  if (redirectParam && isAllowedWordPressReturnUrl(redirectParam)) {
    redirectUrl = redirectParam;
  }

  const maxAge = Math.max(1, exp - nowSec);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(FDF_AUTH_COOKIE, cookieValue, {
    domain: ".feuxdeforet.fr",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge,
  });

  return response;
}
