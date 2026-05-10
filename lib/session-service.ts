import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

/** Nombre max de sessions actives par utilisateur (web + mobile). */
export const MAX_CONCURRENT_USER_SESSIONS = 3;

export type SessionPlatform = "web" | "android" | "ios";

export type SessionAuthProvider =
  | "email"
  | "google"
  | "apple"
  | "facebook";

export type UserSessionDocument = {
  sessionId: string;
  platform: SessionPlatform;
  deviceInfo: string | Record<string, unknown>;
  provider: SessionAuthProvider;
  createdAt: FirebaseFirestore.Timestamp;
  lastActiveAt: FirebaseFirestore.Timestamp;
  isActive: boolean;
};

export type CreateSessionSuccess = {
  success: true;
  revokedSessionId: string | null;
};

export type CreateSessionFailure = {
  success: false;
  error: string;
};

export type CreateSessionResult = CreateSessionSuccess | CreateSessionFailure;

function sessionsCollection(userId: string) {
  return adminDb.collection("users").doc(userId).collection("sessions");
}

function timestampToIso(ts: unknown): string | null {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  return null;
}

function deviceInfoPreview(
  info: string | Record<string, unknown> | undefined
): string {
  if (typeof info === "string") {
    return info.length > 96 ? `${info.slice(0, 96)}…` : info;
  }
  if (info && typeof info === "object" && !Array.isArray(info)) {
    const s = JSON.stringify(info);
    return s.length > 96 ? `${s.slice(0, 96)}…` : s;
  }
  return "—";
}

export type ListedUserSession = {
  sessionId: string;
  platform: SessionPlatform;
  provider: SessionAuthProvider;
  isActive: boolean;
  createdAt: string | null;
  lastActiveAt: string | null;
  deviceInfoPreview: string;
};

export type UserSessionCounts = {
  total: number;
  active: number;
};

function millisFromCreatedAt(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): number {
  try {
    const ts = doc.get("createdAt") as Timestamp | undefined;
    return ts?.toMillis() ?? 0;
  } catch {
    return 0;
  }
}

export const sessionService = {
  /**
   * Crée une session sous `users/{userId}/sessions/{sessionId}`.
   * Si déjà 3 sessions actives, désactive la plus ancienne (historique conservé).
   */
  async createSession(
    userId: string,
    sessionId: string,
    platform: SessionPlatform,
    deviceInfo: string | Record<string, unknown>,
    provider: SessionAuthProvider
  ): Promise<CreateSessionResult> {
    try {
      let revokedSessionId: string | null = null;
      await adminDb.runTransaction(async (tx) => {
        const coll = sessionsCollection(userId);
        const activeSnap = await tx.get(coll.where("isActive", "==", true));
        const sorted = activeSnap.docs
          .slice()
          .sort((a, b) => millisFromCreatedAt(a) - millisFromCreatedAt(b));

        if (sorted.length >= MAX_CONCURRENT_USER_SESSIONS) {
          const oldest = sorted[0]!;
          tx.update(oldest.ref, { isActive: false });
          revokedSessionId = oldest.id;
        }

        const newRef = coll.doc(sessionId);
        tx.set(newRef, {
          sessionId,
          platform,
          deviceInfo,
          provider,
          createdAt: FieldValue.serverTimestamp(),
          lastActiveAt: FieldValue.serverTimestamp(),
          isActive: true,
        });
      });
      return { success: true, revokedSessionId };
    } catch (e) {
      console.error("[sessionService] createSession", e);
      return {
        success: false,
        error: "Impossible de créer la session.",
      };
    }
  },

  /** Marque la session comme inactive (logout), sans supprimer le document. */
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const ref = sessionsCollection(userId).doc(sessionId);
      await ref.set({ isActive: false }, { merge: true });
      return true;
    } catch (e) {
      console.error("[sessionService] revokeSession", e);
      return false;
    }
  },

  /**
   * Vérifie que la session existe et est active ; met à jour `lastActiveAt`.
   */
  async validateSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const ref = sessionsCollection(userId).doc(sessionId);
      const snap = await ref.get();
      if (!snap.exists) {
        return false;
      }
      const data = snap.data() as Partial<UserSessionDocument> | undefined;
      if (!data?.isActive) {
        return false;
      }
      await ref.update({ lastActiveAt: FieldValue.serverTimestamp() });
      return true;
    } catch (e) {
      console.error("[sessionService] validateSession", e);
      return false;
    }
  },

  /** Compteurs de sessions par utilisateur (liste admin). */
  async sessionCountsByUserIds(
    userIds: string[]
  ): Promise<Map<string, UserSessionCounts>> {
    const map = new Map<string, UserSessionCounts>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const snap = await sessionsCollection(uid).get();
          let active = 0;
          for (const d of snap.docs) {
            const data = d.data() as { isActive?: boolean };
            if (data.isActive === true) active += 1;
          }
          map.set(uid, { total: snap.size, active });
        } catch (e) {
          console.error("[sessionService] sessionCountsByUserIds", uid, e);
          map.set(uid, { total: 0, active: 0 });
        }
      })
    );
    return map;
  },

  /** Liste des sessions Firestore pour un utilisateur (admin). */
  async listSessionsForUser(userId: string): Promise<ListedUserSession[]> {
    try {
      const snap = await sessionsCollection(userId).get();
      const rows: ListedUserSession[] = snap.docs.map((d) => {
        const data = d.data() as Partial<UserSessionDocument>;
        return {
          sessionId: d.id,
          platform: (data.platform ?? "web") as SessionPlatform,
          provider: (data.provider ?? "email") as SessionAuthProvider,
          isActive: data.isActive === true,
          createdAt: timestampToIso(data.createdAt),
          lastActiveAt: timestampToIso(data.lastActiveAt),
          deviceInfoPreview: deviceInfoPreview(data.deviceInfo),
        };
      });
      rows.sort((a, b) => {
        const ta = a.lastActiveAt ?? a.createdAt ?? "";
        const tb = b.lastActiveAt ?? b.createdAt ?? "";
        return tb.localeCompare(ta);
      });
      return rows;
    } catch (e) {
      console.error("[sessionService] listSessionsForUser", e);
      return [];
    }
  },
};
