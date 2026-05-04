"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { getMainSiteUrl } from "@/lib/main-site";
import { cn } from "@/lib/utils";

type SubPayload = {
  isPremium: boolean;
  expiryDate: string | null;
  productId: string | null;
  source: "stripe" | "ios" | "android" | null;
};

function sourceLabel(s: SubPayload["source"]) {
  switch (s) {
    case "stripe":
      return "Stripe";
    case "ios":
      return "App Store";
    case "android":
      return "Google Play";
    default:
      return "—";
  }
}

export default function DashboardHomePage() {
  const { user, loading } = useAuth();
  const [sub, setSub] = useState<SubPayload | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/profile/subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as SubPayload;
        if (!cancelled) setSub(data);
      } catch {
        if (!cancelled) setSub(null);
      } finally {
        if (!cancelled) setSubLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || subLoading) {
    return (
      <div className="text-muted-foreground">
        Chargement du profil…
      </div>
    );
  }

  const expiry = sub?.expiryDate
    ? new Date(sub.expiryDate).toLocaleDateString("fr-FR")
    : null;
  const expiredByDate = Boolean(
    sub?.expiryDate && new Date(sub.expiryDate) < new Date()
  );
  const effectivePremium = Boolean(sub?.isPremium && !expiredByDate);

  let badge: React.ReactNode;
  if (effectivePremium) {
    badge = (
      <Badge variant="success">Premium actif</Badge>
    );
  } else if (expiredByDate) {
    badge = <Badge variant="destructive">Expiré</Badge>;
  } else {
    badge = <Badge variant="secondary">Aucun abonnement</Badge>;
  }

  const displayPremium = effectivePremium;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez votre compte et votre abonnement ici.
          </p>
        </div>
        <a
          href={getMainSiteUrl()}
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "default" }),
            "shrink-0 whitespace-nowrap text-center"
          )}
        >
          Retour au site Feux de forêt
        </a>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoURL}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted text-lg font-medium">
                {(user?.displayName || user?.email || "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium">
                {user?.displayName || "Sans nom"}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Abonnement :</span>
            {badge}
          </div>
          <div className="mt-6 rounded-lg border p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              {displayPremium
                ? "Vous serez reconnu comme membre premium sur feuxdeforet.fr (sans publicité)."
                : "Vous serez reconnu comme membre sur feuxdeforet.fr."}
            </p>
            <a
              href="/api/auth/sso"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Accéder à feuxdeforet.fr
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
          {displayPremium && (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Source : </span>
                {sourceLabel(sub?.source ?? null)}
              </p>
              {expiry && (
                <p>
                  <span className="text-muted-foreground">
                    Expiration :{" "}
                  </span>
                  {expiry}
                </p>
              )}
            </div>
          )}
          <Link
            href="/subscription"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Gérer mon abonnement
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
