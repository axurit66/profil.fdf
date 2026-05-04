"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const subscriptionOptions = [
  { value: "application", label: "L'application" },
  { value: "web", label: "Le site web" },
  { value: "none", label: "Je ne suis pas abonné·e" },
  { value: "other", label: "Autre" },
] as const;

export function HelpForm() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [subscriptionOn, setSubscriptionOn] = useState<string>("application");
  const [subscriptionDate, setSubscriptionDate] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setEmail((prev) => (prev === "" ? user.email! : prev));
    }
  }, [user?.email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    setPending(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/help", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          subscriptionOn,
          subscriptionDate,
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setError(data.error || "Envoi impossible.");
        return;
      }
      setSuccess(true);
      setMessage("");
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Chargement…</p>
    );
  }

  if (!user) {
    return null;
  }

  if (success) {
    return (
      <div
        className="rounded-xl border border-success/40 bg-success/10 px-4 py-6 text-sm leading-relaxed text-foreground"
        role="status"
      >
        <p className="font-medium">Message envoyé.</p>
        <p className="mt-2 text-muted-foreground">
          Nous vous répondrons dès que possible à l’adresse indiquée.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">
        En cas de problème (publicité toujours affichée, accès non reconnu,
        etc.), vous pouvez nous contacter via le formulaire suivant :
      </p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="help-email">E-mail</Label>
        <Input
          id="help-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 rounded-xl border-border/80"
        />
        <p className="text-xs text-muted-foreground">
          E-mail utilisé pour créer le compte
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-sub">Abonnement souscrit sur</Label>
        <select
          id="help-sub"
          required
          value={subscriptionOn}
          onChange={(e) => setSubscriptionOn(e.target.value)}
          className={cn(
            "h-10 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          )}
        >
          {subscriptionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-date">Date d&apos;abonnement</Label>
        <Input
          id="help-date"
          type="date"
          required
          value={subscriptionDate}
          onChange={(e) => setSubscriptionDate(e.target.value)}
          className="h-10 rounded-xl border-border/80"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-msg">Message</Label>
        <textarea
          id="help-msg"
          required
          minLength={10}
          rows={6}
          placeholder="Problème rencontré"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(
            "min-h-[120px] w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none",
            "placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          )}
        />
      </div>

      <Button type="submit" disabled={pending} className="rounded-xl">
        {pending ? "Envoi…" : "Envoyer"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Nous vous aiderons au plus vite ! 🚒
      </p>
    </form>
  );
}
