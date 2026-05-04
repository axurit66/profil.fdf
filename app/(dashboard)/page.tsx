"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
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
      <Badge className="bg-green-600 hover:bg-green-600">Premium actif</Badge>
    );
  } else if (expiredByDate) {
    badge = <Badge variant="destructive">Expiré</Badge>;
  } else {
    badge = <Badge variant="secondary">Aucun abonnement</Badge>;
  }

  const displayPremium = effectivePremium;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
          <CardDescription>Compte utilisateur Firebase</CardDescription>
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
