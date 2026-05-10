import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sessionService } from "@/lib/session-service";

/** Header attendu pour l’identifiant de session Firestore (insensible à la casse côté HTTP). */
export const SESSION_ID_HEADER = "x-session-id";

export type ValidSessionContext = {
  userId: string;
  sessionId: string;
};

/**
 * Garde API : Bearer ID token Firebase + `X-Session-Id`.
 * Vérifie le token (Admin SDK), valide la session Firestore et met à jour `lastActiveAt`.
 * @returns Contexte utilisateur ou réponse 401.
 */
export async function requireValidSession(
  request: Request
): Promise<ValidSessionContext | NextResponse> {
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

  const sessionId = request.headers.get(SESSION_ID_HEADER)?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "En-tête X-Session-Id requis." },
      { status: 401 }
    );
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const valid = await sessionService.validateSession(userId, sessionId);
    if (!valid) {
      return NextResponse.json(
        { error: "Session invalide ou révoquée." },
        { status: 401 }
      );
    }
    return { userId, sessionId };
  } catch (e) {
    console.error("[requireValidSession] verifyIdToken ou session", e);
    return NextResponse.json({ error: "Token invalide." }, { status: 401 });
  }
}
