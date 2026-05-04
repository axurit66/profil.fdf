import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminCookieClearOptions,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", adminCookieClearOptions());
  return res;
}
