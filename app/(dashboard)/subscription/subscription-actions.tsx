"use client";

import { Check, CreditCard, Flame, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

type PriceItem = {
  id: string;
  amount: number | null;
  currency: string;
  productName: string;
  productDescription: string | null;
  interval: string | null;
  intervalCount: number;
};

type UserSub = {
  source?: string;
  isPremium?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

function formatMoney(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatBillingFr(interval: string | null, count: number): string {
  if (!interval) return "Facturation récurrente";
  const c = count > 1;
  if (interval === "month")
    return c ? `Tous les ${count} mois` : "Par mois";
  if (interval === "year")
    return c ? `Tous les ${count} ans` : "Par an";
  if (interval === "week")
    return c ? `Toutes les ${count} semaines` : "Par semaine";
  if (interval === "day")
    return c ? `Tous les ${count} jours` : "Par jour";
  return interval;
}

/** Durée d’une période de facturation, en « mois moyens » (année = 12). */
function periodLengthMonths(
  interval: string | null,
  intervalCount: number
): number | null {
  if (!interval || intervalCount < 1) return null;
  const AVG_DAYS_PER_MONTH = 365.25 / 12;
  if (interval === "month") return intervalCount;
  if (interval === "year") return 12 * intervalCount;
  if (interval === "week")
    return (7 * intervalCount) / AVG_DAYS_PER_MONTH;
  if (interval === "day")
    return intervalCount / AVG_DAYS_PER_MONTH;
  return null;
}

/** Montant équivalent par mois (centimes), si ce n’est pas déjà un tarif 1×/mois. */
function equivalentMonthlyCents(
  amount: number | null,
  interval: string | null,
  intervalCount: number
): number | null {
  if (amount == null) return null;
  if (interval === "month" && intervalCount === 1) return null;
  const months = periodLengthMonths(interval, intervalCount);
  if (months == null || months <= 0) return null;
  return Math.round(amount / months);
}

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
  const [selectedId, setSelectedId] = useState<string | null>(
    prices[0]?.id ?? null
  );

  const stripeActive =
    userSub.source === "stripe" &&
    userSub.isPremium &&
    userSub.stripeCustomerId;
  const iapActive =
    (userSub.source === "ios" || userSub.source === "android") &&
    userSub.isPremium;
  const adminActive = userSub.source === "admin" && userSub.isPremium;
  const showPlanPicker = !stripeActive && !iapActive && !adminActive;

  const selected = useMemo(
    () => prices.find((p) => p.id === selectedId) ?? null,
    [prices, selectedId]
  );

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

  async function onContinueCheckout() {
    if (!selectedId) return;
    await subscribe(selectedId);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-4">
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Flame className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Abonnement premium
            </h1>
            <p className="text-sm text-muted-foreground">
              Accès sans publicité et avantages sur feuxdeforet.fr et
              l&apos;application. Paiement sécurisé par Stripe.
            </p>
          </div>
        </div>
      </header>

      {checkoutSuccess && (
        <div
          className="flex gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <p>
            Paiement confirmé. Votre statut premium sera mis à jour sous peu.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {stripeActive && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" aria-hidden />
              <CardTitle>Abonnement web (Stripe)</CardTitle>
            </div>
            <CardDescription>
              Carte, renouvellement et factures depuis le portail Stripe.
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-t bg-muted/30">
            <Button disabled={busy} onClick={() => void openPortal()} className="w-full sm:w-auto">
              Gérer mon abonnement et mes factures
            </Button>
          </CardFooter>
        </Card>
      )}

      {adminActive && (
        <Card>
          <CardHeader>
            <CardTitle>Abonnement attribué</CardTitle>
            <CardDescription>
              Votre accès premium a été activé manuellement. En cas de question,
              contactez le support.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => router.refresh()}>
              Rafraîchir le statut
            </Button>
          </CardFooter>
        </Card>
      )}

      {iapActive && (
        <Card>
          <CardHeader>
            <CardTitle>Abonnement mobile (store)</CardTitle>
            <CardDescription>
              Les achats App Store / Google Play se gèrent depuis votre compte
              sur le store.
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

      {showPlanPicker && (
        <section className="space-y-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Choisir une offre Stripe
              </h2>
              <p className="text-sm text-muted-foreground">
                Sélectionnez une formule puis continuez vers le paiement
                sécurisé.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>Paiement via Stripe</span>
            </div>
          </div>

          {prices.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun prix d&apos;abonnement actif n&apos;est configuré dans
              Stripe. Ajoutez des produits et tarifs récurrents dans le tableau
              de bord Stripe.
            </p>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2">
                {prices.map((p) => {
                  const isSelected = p.id === selectedId;
                  const priceLabel = formatMoney(p.amount, p.currency);
                  const billing = formatBillingFr(p.interval, p.intervalCount);
                  const perMonthCents = equivalentMonthlyCents(
                    p.amount,
                    p.interval,
                    p.intervalCount
                  );
                  const perMonthLabel =
                    perMonthCents != null
                      ? formatMoney(perMonthCents, p.currency)
                      : null;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        disabled={busy}
                        className={cn(
                          "flex w-full flex-col rounded-2xl border-2 bg-card p-5 text-left shadow-sm transition-all",
                          "hover:border-primary/40 hover:shadow-md",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isSelected
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-foreground">
                            {p.productName}
                          </span>
                          <Badge
                            variant={isSelected ? "default" : "secondary"}
                            className="shrink-0"
                          >
                            {billing}
                          </Badge>
                        </div>
                        <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                          {priceLabel}
                          <span className="ml-1 text-base font-normal text-muted-foreground">
                            {p.interval === "year"
                              ? " / an"
                              : p.interval === "month"
                                ? p.intervalCount > 1
                                  ? ` / ${p.intervalCount} mois`
                                  : " / mois"
                                : p.interval === "week"
                                  ? p.intervalCount > 1
                                    ? ` / ${p.intervalCount} sem.`
                                    : " / sem."
                                  : p.interval === "day"
                                    ? p.intervalCount > 1
                                      ? ` / ${p.intervalCount} j.`
                                      : " / jour"
                                    : ""}
                          </span>
                        </p>
                        {perMonthLabel && (
                          <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                            soit {perMonthLabel} par mois
                          </p>
                        )}
                        {p.productDescription && (
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {p.productDescription}
                          </p>
                        )}
                        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full border-2",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            )}
                          >
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            ) : null}
                          </span>
                          {isSelected ? "Offre sélectionnée" : "Choisir cette offre"}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:rounded-xl sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base font-semibold sm:max-w-md"
                  disabled={busy || !selectedId}
                  onClick={() => void onContinueCheckout()}
                >
                  {busy
                    ? "Redirection…"
                    : selected
                      ? `Continuer vers le paiement — ${formatMoney(selected.amount, selected.currency)}`
                      : "Continuer vers le paiement"}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground sm:text-left">
                  Vous serez redirigé vers Stripe Checkout pour finaliser
                  l&apos;abonnement.
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
