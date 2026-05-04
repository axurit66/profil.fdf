"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Mail,
  Shield,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import {
  createAppleOAuthProvider,
  facebookProvider,
  getFirebaseAuth,
  googleProvider,
} from "@/lib/firebase-client";
import { cn } from "@/lib/utils";

function authErrorFr(code: string | undefined): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Mot de passe incorrect.";
    case "auth/requires-recent-login":
      return "Reconnectez-vous (bouton ci-dessous) puis réessayez.";
    case "auth/email-already-in-use":
      return "Cette adresse e-mail est déjà utilisée.";
    case "auth/invalid-email":
      return "Adresse e-mail invalide.";
    case "auth/weak-password":
      return "Mot de passe trop faible (minimum 6 caractères).";
    case "auth/popup-closed-by-user":
      return "Connexion annulée.";
    default:
      return "Une erreur est survenue. Réessayez.";
  }
}

function hasPasswordProvider(user: { providerData: { providerId: string }[] }) {
  return user.providerData.some((p) => p.providerId === "password");
}

function hasGoogleProvider(user: { providerData: { providerId: string }[] }) {
  return user.providerData.some((p) => p.providerId === "google.com");
}

function hasAppleProvider(user: { providerData: { providerId: string }[] }) {
  return user.providerData.some((p) => p.providerId === "apple.com");
}

function hasFacebookProvider(user: { providerData: { providerId: string }[] }) {
  return user.providerData.some((p) => p.providerId === "facebook.com");
}

function SectionShell({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-shadow duration-300 hover:shadow-md",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-4 sm:flex-row sm:gap-4 sm:px-6 sm:py-5">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
            iconClassName
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [deletePassword, setDeletePassword] = useState("");

  const pwUser = user ? hasPasswordProvider(user) : false;
  const gUser = user ? hasGoogleProvider(user) : false;
  const aUser = user ? hasAppleProvider(user) : false;
  const fUser = user ? hasFacebookProvider(user) : false;

  const canChangeEmail = pwUser && !gUser && !aUser && !fUser;
  const socialLinked = gUser || aUser || fUser;

  async function reauthForAction(passwordField: string): Promise<void> {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u || !u.email) throw new Error("Non connecté");
    if (pwUser && passwordField) {
      const cred = EmailAuthProvider.credential(u.email, passwordField);
      await reauthenticateWithCredential(u, cred);
      return;
    }
    if (gUser) {
      await reauthenticateWithPopup(u, googleProvider);
      return;
    }
    if (aUser) {
      await reauthenticateWithPopup(u, createAppleOAuthProvider());
      return;
    }
    if (fUser) {
      await reauthenticateWithPopup(u, facebookProvider);
      return;
    }
    throw new Error("Aucune méthode de reconnnaissance disponible.");
  }

  async function onChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!canChangeEmail || !user?.email || !newEmail.trim()) {
      setError("Saisissez une nouvelle adresse e-mail.");
      return;
    }
    if (newEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      setError("La nouvelle adresse est identique à l’actuelle.");
      return;
    }
    setPending(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      if (!emailPassword) {
        setError("Indiquez votre mot de passe actuel pour confirmer.");
        setPending(false);
        return;
      }
      const cred = EmailAuthProvider.credential(user.email, emailPassword);
      await reauthenticateWithCredential(u, cred);
      await verifyBeforeUpdateEmail(u, newEmail.trim());
      setMessage(
        "Un e-mail de vérification a été envoyé à la nouvelle adresse. Cliquez sur le lien pour confirmer le changement."
      );
      setNewEmail("");
      setEmailPassword("");
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(authErrorFr(code));
    } finally {
      setPending(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u || !user?.email) return;
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, newPassword);
      setMessage("Mot de passe mis à jour.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const token = await u.getIdToken(true);
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        credentials: "include",
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(authErrorFr(code));
    } finally {
      setPending(false);
    }
  }

  async function onDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      await reauthForAction(deletePassword);
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken(true);
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error || "Suppression impossible.");
        setPending(false);
        return;
      }
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
      window.location.href = "/login";
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(authErrorFr(code));
      setPending(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-4">
      <header className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-background to-background px-4 py-7 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Paramètres
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Mon compte
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Sécurisez votre identité : e-mail, mot de passe et suppression du
            compte en un seul endroit.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {pwUser && (
              <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                E-mail · mot de passe
              </span>
            )}
            {gUser && (
              <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                Google
              </span>
            )}
            {aUser && (
              <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                Apple
              </span>
            )}
            {fUser && (
              <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                Facebook
              </span>
            )}
          </div>
        </div>
      </header>

      {message && (
        <div
          className="flex gap-3 rounded-xl border border-success/35 bg-success/10 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-success"
            aria-hidden
          />
          <p className="leading-relaxed">{message}</p>
        </div>
      )}
      {error && (
        <div
          className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {canChangeEmail ? (
          <SectionShell
            icon={Mail}
            title="Adresse e-mail"
            description={
              <>
                Compte actuel :{" "}
                <span className="font-medium text-foreground">{user.email}</span>
                . Indiquez votre mot de passe actuel, puis un lien de
                vérification sera envoyé à la <strong>nouvelle</strong> adresse.
              </>
            }
          >
            <form onSubmit={onChangeEmail} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-email" className="text-foreground">
                  Nouvelle adresse e-mail
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nouvelle@adresse.fr"
                  className="h-10 rounded-xl border-border/80 bg-background/50 transition-colors focus-visible:border-primary/50 focus-visible:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-pw" className="text-foreground">
                  Mot de passe actuel
                </Label>
                <Input
                  id="email-pw"
                  type="password"
                  autoComplete="current-password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="h-10 rounded-xl border-border/80 bg-background/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                />
              </div>
              <Button
                type="submit"
                disabled={pending}
                className="h-10 rounded-xl px-6 font-medium"
              >
                Envoyer le lien de vérification
              </Button>
            </form>
          </SectionShell>
        ) : (
          <SectionShell
            icon={Mail}
            title="Adresse e-mail"
            description={
              <>
                Compte actuel :{" "}
                <span className="font-medium text-foreground">{user.email}</span>
                .
                {socialLinked ? (
                  <>
                    {" "}
                    Avec Google, Apple ou Facebook, l’adresse e-mail est fournie et
                    gérée par ce fournisseur : modifiez-la dans les paramètres du
                    compte concerné (pas depuis cette page).
                  </>
                ) : (
                  <>
                    {" "}
                    Le changement d’e-mail depuis cette page n’est pas disponible
                    pour cette méthode de connexion.
                  </>
                )}
              </>
            }
          >
            <p className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              Pour mettre à jour l’e-mail associé à votre compte, utilisez les
              paramètres du service avec lequel vous vous connectez, ou créez un
              compte avec e-mail et mot de passe.
            </p>
          </SectionShell>
        )}

        {pwUser && (
          <SectionShell
            icon={KeyRound}
            title="Mot de passe"
            description="Choisissez un mot de passe fort. Il servira pour vous connecter avec votre e-mail."
          >
            <form onSubmit={onChangePassword} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="cur-pw">Mot de passe actuel</Label>
                  <Input
                    id="cur-pw"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="h-10 rounded-xl border-border/80 bg-background/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-pw">Nouveau mot de passe</Label>
                    <Input
                      id="new-pw"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      className="h-10 rounded-xl border-border/80 bg-background/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conf-pw">Confirmation</Label>
                    <Input
                      id="conf-pw"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="h-10 rounded-xl border-border/80 bg-background/50 focus-visible:border-primary/50 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
              <Button
                type="submit"
                disabled={pending}
                variant="secondary"
                className="h-10 rounded-xl px-6"
              >
                Mettre à jour le mot de passe
              </Button>
            </form>
          </SectionShell>
        )}

        <section className="overflow-hidden rounded-2xl border border-destructive/25 bg-gradient-to-b from-destructive/[0.04] to-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-destructive/15 bg-destructive/[0.06] px-4 py-4 sm:flex-row sm:gap-4 sm:px-6 sm:py-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <Trash2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-destructive">
                Supprimer le compte
                <Shield className="h-4 w-4 opacity-70" aria-hidden />
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Suppression définitive de votre compte et des données profil.
                Résiliez vos abonnements (Stripe ou stores) avant si nécessaire.
              </p>
            </div>
          </div>
          <form onSubmit={onDeleteAccount} className="space-y-5 p-4 sm:p-6">
            {pwUser && (
              <div className="space-y-2">
                <Label htmlFor="del-pw">Mot de passe pour confirmer</Label>
                <Input
                  id="del-pw"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  className="h-10 rounded-xl border-destructive/20 bg-background/50 focus-visible:border-destructive/50 focus-visible:ring-destructive/20"
                />
              </div>
            )}
            {!pwUser && (
              <p className="rounded-lg border border-dashed border-destructive/20 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                Une fenêtre Google, Apple ou Facebook s’ouvrira pour confirmer
                votre identité avant suppression.
              </p>
            )}
            <Button
              type="submit"
              variant="destructive"
              disabled={pending}
              className="h-10 rounded-xl px-6 font-medium"
            >
              Supprimer définitivement mon compte
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
