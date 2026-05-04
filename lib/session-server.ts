import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function getSessionUid(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(token, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function requireSessionUid(): Promise<string> {
  const uid = await getSessionUid();
  if (!uid) redirect("/login");
  return uid;
}
