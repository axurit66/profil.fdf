"use client";

import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { setupPostLoginReload } from "@/lib/post-login-navigation";
import { storeOAuthPostLoginPath } from "@/lib/oauth-post-login";
import { getMainSiteUrl } from "@/lib/main-site";
import { cn } from "@/lib/utils";

function mapFirebaseError(code: string | undefined): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "Cette adresse e-mail est déjà utilisée.";
    case "auth/invalid-email":
      return "Adresse e-mail invalide.";
    case "auth/weak-password":
      return "Mot de passe trop faible. Essayez plus long ou plus complexe.";
    case "auth/account-exists-with-different-credential":
      return "Un compte existe déjà avec une autre méthode de connexion.";
    default:
      return "Une erreur est survenue. Réessayez.";
  }
}

function RegisterForm() {
  const {
    user,
    loading,
    register,
    signInWithGoogle,
    signInWithApple,
    signInWithFacebook,
  } = useAuth();
  const searchParams = useSearchParams();
  const postLoginPath = searchParams.get("redirect");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loginHref =
    postLoginPath &&
    postLoginPath.startsWith("/") &&
    !postLoginPath.startsWith("//")
      ? `/login?redirect=${encodeURIComponent(postLoginPath)}`
      : "/login";

  useEffect(() => {
    if (loading || !user) return;
    return setupPostLoginReload(postLoginPath);
  }, [user, loading, postLoginPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    try {
      await register(email, password);
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(mapFirebaseError(code));
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setPending(true);
    try {
      const path =
        postLoginPath &&
        postLoginPath.startsWith("/") &&
        !postLoginPath.startsWith("//")
          ? postLoginPath
          : "/";
      storeOAuthPostLoginPath(path);
      await signInWithGoogle();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(mapFirebaseError(code));
    } finally {
      setPending(false);
    }
  }

  async function onApple() {
    setError(null);
    setPending(true);
    try {
      const path =
        postLoginPath &&
        postLoginPath.startsWith("/") &&
        !postLoginPath.startsWith("//")
          ? postLoginPath
          : "/";
      storeOAuthPostLoginPath(path);
      await signInWithApple();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(mapFirebaseError(code));
    } finally {
      setPending(false);
    }
  }

  async function onFacebook() {
    setError(null);
    setPending(true);
    try {
      const path =
        postLoginPath &&
        postLoginPath.startsWith("/") &&
        !postLoginPath.startsWith("//")
          ? postLoginPath
          : "/";
      storeOAuthPostLoginPath(path);
      await signInWithFacebook();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(mapFirebaseError(code));
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <p className="text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="relative mx-auto w-full max-w-md px-5">
        <Link
          href={getMainSiteUrl()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-zinc-100"
          aria-label="Retour"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} />
        </Link>

        <div className="mt-4 flex flex-col items-center">
          <Image
            src="/icone.svg"
            alt=""
            width={112}
            height={112}
            priority
            className="h-28 w-28 select-none"
          />
          <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-zinc-950">
            Feux de Forêt
          </h1>
        </div>

        <div className="mt-10 flex flex-col gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void onGoogle()}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-900 shadow-sm transition-colors",
              "hover:bg-zinc-50 disabled:opacity-50"
            )}
          >
            <GoogleGlyph className="h-5 w-5 shrink-0" />
            Continuer avec Google
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onFacebook()}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] text-sm font-medium text-white shadow-sm transition-colors",
              "hover:bg-[#166fe5] disabled:opacity-50"
            )}
          >
            <FacebookGlyph className="h-5 w-5 shrink-0 text-white" />
            Continuer avec Facebook
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onApple()}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-sm font-medium text-white shadow-sm transition-colors",
              "hover:bg-zinc-900 disabled:opacity-50"
            )}
          >
            <AppleGlyph className="h-5 w-5 shrink-0 text-white" />
            Continuer avec Apple
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-zinc-500">
          ou avec votre e-mail
        </p>

        <div className="mt-5 flex rounded-xl bg-zinc-100 p-1">
          <Link
            href={loginHref}
            className="flex flex-1 items-center justify-center rounded-lg py-2.5 text-center text-sm font-semibold text-primary"
          >
            Se connecter
          </Link>
          <span className="flex-1 rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-sm">
            Créer un compte
          </span>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="relative">
            <label htmlFor="register-email" className="sr-only">
              E-mail
            </label>
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-zinc-600"
              aria-hidden
            />
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-xl border-zinc-200 bg-white pl-11 pr-3 text-base placeholder:text-zinc-400 md:text-base"
            />
          </div>

          <div>
            <div className="relative">
              <label htmlFor="register-password" className="sr-only">
                Mot de passe
              </label>
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-zinc-600"
                aria-hidden
              />
              <Input
                id="register-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-12 rounded-xl border-zinc-200 bg-white pl-11 pr-12 text-base placeholder:text-zinc-400 md:text-base"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                }
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 px-0.5 text-xs leading-snug text-zinc-500">
              Au moins 6 caractères (recommandé : 8+ avec majuscules, chiffres et
              symboles).
            </p>
          </div>

          <div className="relative">
            <label htmlFor="register-confirm" className="sr-only">
              Confirmer le mot de passe
            </label>
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-zinc-600"
              aria-hidden
            />
            <Input
              id="register-confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirmer le mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="h-12 rounded-xl border-zinc-200 bg-white pl-11 pr-12 text-base placeholder:text-zinc-400 md:text-base"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={
                showConfirm
                  ? "Masquer la confirmation"
                  : "Afficher la confirmation"
              }
            >
              {showConfirm ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className={cn(
              "flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-base font-semibold text-primary shadow-sm transition-colors",
              "hover:bg-zinc-50 disabled:opacity-50"
            )}
          >
            Créer un compte
          </button>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-white">
          <p className="text-muted-foreground">Chargement…</p>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.17 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  );
}

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}
