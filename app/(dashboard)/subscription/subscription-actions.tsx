"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

type PriceItem = {
  id: string;
  amount: number | null;
  currency: string;
  productName: string | undefined;
};

type UserSub = {
  source?: string;
  isPremium?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export default function SubscriptionActions({
  userSub,
  prices,
  checkoutSuccess,
}: {
  userSub: UserSub;
  prices: PriceItem[];
  checkoutSuccess: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stripeActive =
    userSub.source === "stripe" &&
    userSub.isPremium &&
    userSub.stripeCustomerId;
  const iapActive =
    (userSub.source === "ios" || userSub.source === "android") &&
    userSub.isPremium;

  async function authFetch(url: string, body?: object) {
    if (!user) throw new Error("Non connecté");
    const token = await user.getIdToken();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Erreur serveur");
    }
    return data;
  }

  async function openPortal() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await authFetch("/api/stripe/portal");
      if (url) window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(priceId: string) {
    setError(null);
    setBusy(true);
    try {
      const { url } = await authFetch("/api/stripe/checkout", { priceId });
      if (url) window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Abonnement</h1>
        <p className="text-sm text-muted-foreground">
          Gérez votre abonnement premium (web ou applications mobiles).
        </p>
      </div>

      {checkoutSuccess && (
        <p className="rounded-md border border-success/40 bg-success/15 px-3 py-2 text-sm text-foreground">
          Paiement confirmé. Votre abonnement sera mis à jour sous peu.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {stripeActive && (
        <Card>
          <CardHeader>
            <CardTitle>Abonnement Stripe</CardTitle>
            <CardDescription>
              Gérez votre paiement, carte et factures via le portail Stripe.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button disabled={busy} onClick={() => void openPortal()}>
              Gérer sur Stripe
            </Button>
          </CardFooter>
        </Card>
      )}

      {iapActive && (
        <Card>
          <CardHeader>
            <CardTitle>Abonnement mobile</CardTitle>
            <CardDescription>
              Les achats intégrés (App Store ou Google Play) se gèrent depuis
              les réglages de votre compte sur le store correspondant.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              App Store
            </a>
            <a
              href="https://play.google.com/store/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Google Play
            </a>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" onClick={() => router.refresh()}>
              Rafraîchir le statut
            </Button>
          </CardFooter>
        </Card>
      )}

      {!stripeActive && !iapActive && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Offres disponibles</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {prices.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {p.productName || "Abonnement"}
                  </CardTitle>
                  <CardDescription>
                    {p.amount != null
                      ? `${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`
                      : "Prix sur demande"}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button
                    disabled={busy}
                    onClick={() => void subscribe(p.id)}
                    className="w-full"
                  >
                    S&apos;abonner
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          {prices.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune offre configurée dans Stripe pour le moment.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
