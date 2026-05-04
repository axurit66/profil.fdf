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
  signInWithPopup,
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "include",
      cache: "no-store",
    });
    if (res.ok) return;
    await new Promise((r) => setTimeout(r, 120));
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
          if (nextUser) {
            const token = await nextUser.getIdToken(true);
            await syncSessionCookie(token);
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
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    await firebaseSignOut(getFirebaseAuth());
    if (typeof window === "undefined") return;
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
