"use client";

import { useEffect, type ReactNode } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { useAuth } from "@/context/AuthContext";
import {
  getStoredSessionId,
  replaceSessionWatch,
  revokeSession,
  stopSessionWatch,
} from "@/lib/session-client";

type SessionGuardProps = {
  userId: string;
  children: ReactNode;
};

/**
 * Garde client : session Firestore locale obligatoire sur les routes dashboard.
 */
export function SessionGuard({ userId, children }: SessionGuardProps) {
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user?.uid || user.uid !== userId) {
      void signOut();
      return;
    }

    const sid = getStoredSessionId();
    if (!sid) {
      void signOut();
      return;
    }

    const onRevoked = () => {
      void (async () => {
        const u = getFirebaseAuth().currentUser;
        if (!u) return;
        const s = getStoredSessionId();
        if (!s) return;
        const t = await u.getIdToken().catch(() => "");
        if (!t) return;
        await revokeSession(userId, s, t, { displaced: true });
      })();
    };

    replaceSessionWatch(userId, sid, onRevoked);
    return () => {
      stopSessionWatch();
    };
  }, [userId, user?.uid, loading, signOut]);

  return <>{children}</>;
}
