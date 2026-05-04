import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function requireBearerUid(
  request: Request
): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return NextResponse.json(
      { error: "Authentification requise (Bearer token)." },
      { status: 401 }
    );
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Token invalide." }, { status: 401 });
  }
}
