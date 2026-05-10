import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { sessionService } from "@/lib/session-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = getAdminSessionFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const uid = request.nextUrl.searchParams.get("uid")?.trim();
  if (!uid) {
    return NextResponse.json({ error: "Paramètre uid requis." }, { status: 400 });
  }

  const sessions = await sessionService.listSessionsForUser(uid);
  return NextResponse.json({ sessions });
}
