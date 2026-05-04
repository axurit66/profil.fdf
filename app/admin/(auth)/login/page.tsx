"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AdminLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" });
        if (!cancelled && res.ok) {
          router.replace("/admin");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Erreur.");
        return;
      }
      setMessage(data.message ?? null);
      setStep("code");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          code: code.replace(/\s/g, ""),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Code incorrect.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">
        Administration profil
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Connexion réservée : un code à 6 chiffres est envoyé à votre adresse
        autorisée.
      </p>

      {step === "email" ? (
        <form onSubmit={(e) => void requestCode(e)} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adm-email">E-mail administrateur</Label>
            <Input
              id="adm-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Envoi…" : "Recevoir le code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void verifyCode(e)} className="mt-6 space-y-4">
          {message && (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              {message}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="adm-code">Code à 6 chiffres</Label>
            <Input
              id="adm-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-10 tracking-widest"
              placeholder="000000"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Vérification…" : "Valider"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Retour
            </Button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="text-primary underline">
          Retour au profil
        </Link>
      </p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <p className="text-center text-muted-foreground">Chargement…</p>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
