"use client";

import { doc, onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";
import { signOut as firebaseSignOut } from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase-client";

/** Clé localStorage pour l’UUID de session web (aligné usage FDF_ côté cookies). */
const SESSION_STORAGE_KEY = "fdf_web_session_id";

/** Message affiché sur /login après révocation à distance. */
export const SESSION_REVOKED_FLASH_KEY = "fdf_session_revoked_flash";

const SESSION_REVOKED_MESSAGE =
  "Votre session a été fermée car un nouvel appareil s'est connecté.";

export type SessionAuthProvider =
  | "email"
  | "google"
  | "apple"
  | "facebook";

export type InitSessionSuccess = {
  success: true;
  revokedSessionId: string | null;
};

export type InitSessionFailure = { success: false };

function sessionApiUrl(): string {
  return new URL("/api/auth/session", window.location.origin).toString();
}

export function sessionProviderFromUser(user: User): SessionAuthProvider {
  const pid = user.providerData[0]?.providerId;
  if (pid === "google.com") return "google";
  if (pid === "apple.com") return "apple";
  if (pid === "facebook.com") return "facebook";
  return "email";
}

export function consumeSessionRevokedFlash(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_REVOKED_FLASH_KEY);
    sessionStorage.removeItem(SESSION_REVOKED_FLASH_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Révoque la session Firestore côté API (sans déconnexion Firebase ni redirection). */
export async function revokeDeviceSessionRemote(
  sessionId: string,
  firebaseIdToken: string
): Promise<void> {
  if (typeof window === "undefined") return;
  await fetch(sessionApiUrl(), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      "X-Session-Id": sessionId,
    },
    credentials: "include",
    cache: "no-store",
  });
}

export function clearStoredSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Initialise une session appareil (Firestore) côté serveur.
 * À enchaîner avec replaceSessionWatch après succès.
 */
export async function initSession(
  userId: string,
  firebaseIdToken: string,
  provider: SessionAuthProvider
): Promise<InitSessionSuccess | InitSessionFailure> {
  if (typeof window === "undefined") {
    return { success: false };
  }

  const sessionId = crypto.randomUUID();
  const deviceInfo = navigator.userAgent;

  try {
    const res = await fetch(sessionApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
      },
      body: JSON.stringify({
        sessionId,
        platform: "web",
        deviceInfo,
        provider,
      }),
      credentials: "include",
      cache: "no-store",
    });

    const data = (await res.json()) as {
      success?: boolean;
      revokedSessionId?: string | null;
      error?: string;
    };

    if (!res.ok || data.success !== true) {
      await revokeSession(userId, sessionId, firebaseIdToken);
      return { success: false };
    }

    try {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } catch {
      await revokeSession(userId, sessionId, firebaseIdToken);
      return { success: false };
    }

    return {
      success: true,
      revokedSessionId:
        data.revokedSessionId === undefined || data.revokedSessionId === null
          ? null
          : data.revokedSessionId,
    };
  } catch {
    await revokeSession(userId, sessionId, firebaseIdToken);
    return { success: false };
  }
}

/**
 * Écoute `users/{userId}/sessions/{sessionId}` ; si la session est inactive ou absente, `onRevoked`.
 */
export function watchSession(
  userId: string,
  sessionId: string,
  onRevoked: () => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const ref = doc(getFirebaseDb(), "users", userId, "sessions", sessionId);
  let finished = false;

  const safeRevoked = () => {
    if (finished) return;
    finished = true;
    onRevoked();
  };

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        safeRevoked();
        return;
      }
      const active = snap.data()?.isActive === true;
      if (!active) {
        safeRevoked();
      }
    },
    () => {
      safeRevoked();
    }
  );
}

let activeWatchUnsub: (() => void) | null = null;

/** Remplace l’écoute Firestore active (évite les doublons AuthContext / SessionGuard). */
export function replaceSessionWatch(
  userId: string,
  sessionId: string,
  onRevoked: () => void
): void {
  activeWatchUnsub?.();
  activeWatchUnsub = watchSession(userId, sessionId, onRevoked);
}

export function stopSessionWatch(): void {
  activeWatchUnsub?.();
  activeWatchUnsub = null;
}

/**
 * Révoque la session serveur, nettoie le stockage local, déconnecte Firebase et renvoie vers /login.
 * `displaced` : message flash sur la page login après redirection.
 */
export async function revokeSession(
  userId: string,
  sessionId: string,
  firebaseIdToken: string,
  options?: { displaced?: boolean }
): Promise<void> {
  if (typeof window === "undefined") return;
  void userId;

  try {
    await revokeDeviceSessionRemote(sessionId, firebaseIdToken);
  } catch {
    /* on poursuit le nettoyage local */
  }

  clearStoredSessionId();

  if (options?.displaced) {
    try {
      sessionStorage.setItem(SESSION_REVOKED_FLASH_KEY, SESSION_REVOKED_MESSAGE);
    } catch {
      /* ignore */
    }
  }

  try {
    await firebaseSignOut(getFirebaseAuth());
  } catch {
    /* ignore */
  }

  window.location.href = "/login";
}

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SESSION_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * fetch enrichi : en-têtes `X-Session-Id` et `Authorization` (Bearer via currentUser) si absents.
 */
export async function sessionFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  if (typeof window === "undefined") {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers ?? undefined);
  const sid = getStoredSessionId();
  if (sid) {
    headers.set("x-session-id", sid);
  }

  const existingAuth =
    headers.get("Authorization") ?? headers.get("authorization");
  if (!existingAuth) {
    const u = getFirebaseAuth().currentUser;
    if (u) {
      const token = await u.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  });
}
