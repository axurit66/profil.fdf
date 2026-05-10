import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import {
  isUserPremiumActive,
  parseUserExpiryMs,
} from "@/lib/user-subscription-firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FDF_AUTH_COOKIE = "fdf_auth";
/** Cookie marqueur léger lu par les caches HTTP (WP / Cloudflare) pour bypasser le cache des premium. */
const FDF_PREMIUM_COOKIE = "fdf_premium";

/** Durée max du cookie / du champ `exp` : évite un jeton « premium » valide longtemps après une mise à jour Firestore. */
function getSsoCookieMaxAgeSec(): number {
  const raw = process.env.SSO_COOKIE_MAX_AGE_SECONDS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 60 && n <= 60 * 60 * 24 * 30) {
    return Math.floor(n);
  }
  return 60 * 60 * 24; // 24 h par défaut
}

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
  const data = doc.data() as Record<string, unknown> | undefined;

  const isPremium = isUserPremiumActive(data);
  const level: "premium" | "free" = isPremium ? "premium" : "free";
  const nowSec = Math.floor(Date.now() / 1000);
  const expiryMs = parseUserExpiryMs(data);
  const subEndSec =
    expiryMs != null ? Math.floor(expiryMs / 1000) : null;

  const maxAgeCap = getSsoCookieMaxAgeSec();
  const distantCap = nowSec + maxAgeCap;

  let exp: number;
  if (isPremium && subEndSec != null && subEndSec > nowSec) {
    exp = Math.min(subEndSec, distantCap);
  } else if (isPremium) {
    exp = distantCap;
  } else {
    exp = distantCap;
  }

  const maxAge = Math.max(1, exp - nowSec);

  const payloadObj: Record<string, string | number> = {
    uid,
    level,
    iat: nowSec,
    exp,
  };
  if (
    isPremium &&
    subEndSec != null &&
    subEndSec > nowSec &&
    subEndSec > exp
  ) {
    payloadObj.subscriptionEndsAt = subEndSec;
  }

  const payload = JSON.stringify(payloadObj);
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

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(FDF_AUTH_COOKIE, cookieValue, {
    domain: ".feuxdeforet.fr",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge,
  });

  if (isPremium) {
    response.cookies.set(FDF_PREMIUM_COOKIE, "1", {
      domain: ".feuxdeforet.fr",
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge,
    });
  } else {
    response.cookies.set(FDF_PREMIUM_COOKIE, "", {
      domain: ".feuxdeforet.fr",
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
    });
  }

  return response;
}
