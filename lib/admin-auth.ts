import * as crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "admin_session";

const SESSION_MAX_AGE_SEC = 8 * 60 * 60;

export function getSessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET manquant ou trop court (32+ caractères).");
  }
  return s;
}

export function getAllowedAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_ALLOWED_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedAdminEmail(email: string): boolean {
  return getAllowedAdminEmails().has(email.trim().toLowerCase());
}

export function hashAdminOtp(emailNorm: string, code: string): string {
  const secret = getSessionSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(`${emailNorm}:${code}`)
    .digest("hex");
}

export function signAdminSession(email: string): string {
  const secret = getSessionSecret();
  const payload = {
    v: 1 as const,
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifyAdminSessionToken(
  token: string | undefined
): { email: string } | null {
  if (!token || !token.includes(".")) return null;
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }
  try {
    const [payloadB64, sig] = token.split(".") as [string, string];
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest("hex");
    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { v?: number; email?: string; exp?: number };
    if (payload.v !== 1 || typeof payload.email !== "string" || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const email = payload.email.trim().toLowerCase();
    if (!isAllowedAdminEmail(email)) return null;
    return { email };
  } catch {
    return null;
  }
}

export function getAdminSessionFromCookies(): { email: string } | null {
  const c = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionToken(c);
}

export function getAdminSessionFromRequest(req: NextRequest): {
  email: string;
} | null {
  return verifyAdminSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function adminSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function adminCookieClearOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
