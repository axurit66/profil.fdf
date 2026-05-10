"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  clearOAuthPostLoginPath,
  readOAuthReturnPathFromBrowser,
} from "@/lib/oauth-post-login";
import {
  createAppleOAuthProvider,
  facebookProvider,
  getFirebaseAuth,
  googleProvider,
} from "@/lib/firebase-client";
import {
  clearStoredSessionId,
  initSession,
  revokeDeviceSessionRemote,
  sessionProviderFromUser,
  stopSessionWatch,
  getStoredSessionId,
} from "@/lib/session-client";
import { getLogoutUrl } from "@/lib/main-site";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signOut: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function syncSessionCookie(idToken: string | null) {
  if (!idToken) return;
  const url =
    typeof window !== "undefined"
      ? new URL("/api/auth/session", window.location.origin).toString()
      : "/api/auth/session";
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "include",
      cache: "no-store",
    });
    if (res.ok) return;
    await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      await auth.authStateReady();

      try {
        const redirectResult = await getRedirectResult(auth);

        const returnPath = readOAuthReturnPathFromBrowser();

        if (redirectResult?.user) {
          clearOAuthPostLoginPath();
          let path = returnPath ?? "/";
          if (!path.startsWith("/") || path.startsWith("//")) path = "/";
          try {
            const token = await redirectResult.user.getIdToken(true);
            await syncSessionCookie(token);
            await syncSessionCookie(await redirectResult.user.getIdToken(true));
            await new Promise((r) => setTimeout(r, 200));
          } catch {
            /* rechargement même si cookie échoue */
          }
          window.location.replace(new URL(path, window.location.origin).href);
          return;
        }
      } catch {
        clearOAuthPostLoginPath();
      }

      if (cancelled) return;

      unsub = onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);
        setLoading(true);
        try {
          stopSessionWatch();
          if (nextUser) {
            const token = await nextUser.getIdToken(true);
            await syncSessionCookie(token);

            let sid = getStoredSessionId();
            if (!sid) {
              const provider = sessionProviderFromUser(nextUser);
              const created = await initSession(nextUser.uid, token, provider);
              if (!created.success) {
                await syncSessionCookie(await nextUser.getIdToken(true));
                return;
              }
              sid = getStoredSessionId();
            }

            if (!sid) {
              try {
                await fetch("/api/auth/session", {
                  method: "DELETE",
                  credentials: "include",
                });
              } catch {
                /* ignore */
              }
              try {
                await firebaseSignOut(auth);
              } catch {
                /* ignore */
              }
              if (typeof window !== "undefined") {
                window.location.href = "/login";
              }
              return;
            }
            await syncSessionCookie(await nextUser.getIdToken(true));
          } else {
            clearStoredSessionId();
          }
        } catch {
          /* cookie session optionnel pour la navigation client */
        } finally {
          setLoading(false);
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
      stopSessionWatch();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithRedirect(getFirebaseAuth(), googleProvider);
  }, []);

  const signInWithApple = useCallback(async () => {
    await signInWithRedirect(getFirebaseAuth(), createAppleOAuthProvider());
  }, []);

  const signInWithFacebook = useCallback(async () => {
    await signInWithRedirect(getFirebaseAuth(), facebookProvider);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signOut = useCallback(async () => {
    stopSessionWatch();
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    const sid = getStoredSessionId();
    if (sid && u) {
      try {
        const t = await u.getIdToken();
        await revokeDeviceSessionRemote(sid, t);
      } catch {
        /* ignore */
      }
    }
    clearStoredSessionId();
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    await firebaseSignOut(auth);
    if (typeof window === "undefined") return;
    const logoutAfter = getLogoutUrl();
    if (logoutAfter) {
      window.location.href = logoutAfter;
      return;
    }
    const backPath =
      window.location.pathname + window.location.search || "/";
    const url = new URL("/login", window.location.origin);
    url.searchParams.set("redirect", backPath);
    window.location.href = url.pathname + url.search;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signInWithEmail,
      signInWithGoogle,
      signInWithApple,
      signInWithFacebook,
      signOut,
      register,
    }),
    [
      user,
      loading,
      signInWithEmail,
      signInWithGoogle,
      signInWithApple,
      signInWithFacebook,
      signOut,
      register,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans AuthProvider");
  }
  return ctx;
}
