import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { sessionService } from "@/lib/session-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = getAdminSessionFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  let body: { userId?: unknown; sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const userId =
    typeof body.userId === "string" ? body.userId.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!userId || !sessionId) {
    return NextResponse.json(
      { error: "userId et sessionId requis." },
      { status: 400 }
    );
  }

  const ok = await sessionService.revokeSession(userId, sessionId);
  if (!ok) {
    return NextResponse.json(
      { error: "Impossible de révoquer la session." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
