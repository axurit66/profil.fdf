"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isStoreOrStripeSubscriptionSource } from "@/lib/subscription-source";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminUserRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  providers: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
  subscription: {
    isPremium: boolean;
    source: string | null;
    expiryDate: string | null;
  } | null;
};

type AdminStats = {
  authUsersTotal: number;
  firestoreProfiles: number;
  notPremiumActive: number;
  premiumBySource: {
    stripe: number;
    ios: number;
    android: number;
    admin: number;
    other: number;
  };
  storeManagedTotal: number;
};

function providerShort(id: string): string {
  if (id === "password") return "E-mail";
  if (id === "google.com") return "Google";
  if (id === "apple.com") return "Apple";
  if (id === "facebook.com") return "Facebook";
  return id.replace(".com", "");
}

export default function AdminHomePage() {
  const router = useRouter();
  const [grantEmail, setGrantEmail] = useState("");
  const [grantMode, setGrantMode] = useState<"date" | "unlimited">("date");
  const [expiresAt, setExpiresAt] = useState("");
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantPending, setGrantPending] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [tokenChain, setTokenChain] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [lastNextPageToken, setLastNextPageToken] = useState<
    string | undefined
  >();

  const [searchEmail, setSearchEmail] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) {
        setStats(null);
        return;
      }
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const loadPage = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const qs = new URLSearchParams({ pageSize: "50" });
      if (activeSearch) {
        qs.set("email", activeSearch);
      } else {
        const token = tokenChain[pageIndex];
        if (token) qs.set("pageToken", token);
      }
      const res = await fetch(`/api/admin/users?${qs}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        users?: AdminUserRow[];
        nextPageToken?: string;
        error?: string;
      };
      if (!res.ok) {
        setListError(data.error || "Erreur de chargement.");
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
      setLastNextPageToken(data.nextPageToken);
    } catch {
      setListError("Erreur réseau.");
      setUsers([]);
    } finally {
      setListLoading(false);
    }
  }, [pageIndex, tokenChain, activeSearch]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setGrantError(null);
    setGrantMessage(null);
    if (grantMode === "date" && !expiresAt) {
      setGrantError("Indiquez une date de fin d’abonnement.");
      return;
    }
    setGrantPending(true);
    try {
      const body =
        grantMode === "unlimited"
          ? { userEmail: grantEmail.trim(), unlimited: true as const }
          : {
              userEmail: grantEmail.trim(),
              expiresAtIso: new Date(expiresAt).toISOString(),
            };
      const res = await fetch("/api/admin/grant-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        expiresAt?: string;
        unlimited?: boolean;
      };
      if (!res.ok) {
        setGrantError(data.error || "Erreur.");
        return;
      }
      if (data.unlimited) {
        setGrantMessage("Abonnement premium illimité activé.");
      } else {
        setGrantMessage(
          `Abonnement premium activé jusqu’au ${new Date(data.expiresAt ?? "").toLocaleString("fr-FR")}.`
        );
      }
      setExpiresAt("");
      await loadPage();
      await loadStats();
    } catch {
      setGrantError("Erreur réseau.");
    } finally {
      setGrantPending(false);
    }
  }

  async function revokeSubscription(email: string) {
    if (
      !confirm(
        `Retirer le statut premium pour ${email} ? (Les paiements Stripe ou les abonnements stores ne sont pas résiliés automatiquement.)`
      )
    ) {
      return;
    }
    setGrantError(null);
    setGrantMessage(null);
    setRevokingEmail(email);
    try {
      const res = await fetch("/api/admin/revoke-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userEmail: email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setGrantError(data.error || "Impossible d’annuler.");
        return;
      }
      setGrantMessage(`Abonnement retiré pour ${email}.`);
      await loadPage();
      await loadStats();
    } catch {
      setGrantError("Erreur réseau.");
    } finally {
      setRevokingEmail(null);
    }
  }

  const grantTargetLocked =
    grantEmail.trim().length > 0 &&
    users.some(
      (u) =>
        u.email?.toLowerCase() === grantEmail.trim().toLowerCase() &&
        isStoreOrStripeSubscriptionSource(u.subscription?.source)
    );

  function goNextPage() {
    if (!lastNextPageToken || activeSearch) return;
    setTokenChain((prev) => {
      const next = [...prev];
      next[pageIndex + 1] = lastNextPageToken;
      return next;
    });
    setPageIndex((p) => p + 1);
  }

  function goPrevPage() {
    if (pageIndex <= 0 || activeSearch) return;
    setPageIndex((p) => p - 1);
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchEmail.trim();
    if (!q) {
      clearSearch();
      return;
    }
    setActiveSearch(q);
    setPageIndex(0);
    setTokenChain([undefined]);
    setLastNextPageToken(undefined);
  }

  function clearSearch() {
    setActiveSearch(null);
    setSearchEmail("");
    setPageIndex(0);
    setTokenChain([undefined]);
    setLastNextPageToken(undefined);
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Administration — utilisateurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Liste Firebase Auth enrichie avec les données d’abonnement Firestore.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => void logout()}
        >
          Déconnexion admin
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Statistiques</h2>
        {statsLoading && (
          <p className="text-sm text-muted-foreground">Chargement des stats…</p>
        )}
        {!statsLoading && stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Comptes Firebase
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.authUsersTotal}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Profils Firestore
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.firestoreProfiles}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Sans premium actif
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.notPremiumActive}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Premium (Stripe + stores)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.storeManagedTotal}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Premium Stripe
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.premiumBySource.stripe}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Premium App Store
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.premiumBySource.ios}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Premium Google Play
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.premiumBySource.android}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Premium admin
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.premiumBySource.admin}
              </CardContent>
            </Card>
            <Card className="sm:col-span-2 lg:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Autre source premium
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {stats.premiumBySource.other}
              </CardContent>
            </Card>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Les compteurs « premium » reflètent un abonnement actif (non expiré).
          Les abonnements Stripe / stores ne peuvent pas être modifiés depuis
          cette interface.
        </p>
      </section>

      {grantError && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {grantError}
        </p>
      )}
      {grantMessage && !grantError && (
        <p
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {grantMessage}
        </p>
      )}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-4 sm:px-6">
          <h2 className="text-lg font-medium">Recherche</h2>
          <form
            onSubmit={runSearch}
            className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="max-w-md flex-1 space-y-2">
              <Label htmlFor="search-email">E-mail exact (Firebase Auth)</Label>
              <Input
                id="search-email"
                type="email"
                placeholder="utilisateur@exemple.fr"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Rechercher</Button>
              <Button type="button" variant="ghost" onClick={clearSearch}>
                Réinitialiser la liste
              </Button>
            </div>
          </form>
          {activeSearch && (
            <p className="mt-2 text-sm text-muted-foreground">
              Résultat pour : <strong>{activeSearch}</strong>
            </p>
          )}
        </div>

        <div className="-mx-2 overflow-x-auto px-2 pb-4 pt-2 sm:mx-0 sm:px-4">
          {listError && (
            <p className="mb-3 px-2 text-sm text-destructive" role="alert">
              {listError}
            </p>
          )}
          {listLoading ? (
            <p className="px-4 py-8 text-center text-muted-foreground">
              Chargement…
            </p>
          ) : (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Connexion</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Abonnement</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Aucun utilisateur.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const sub = u.subscription;
                    const subLocked = isStoreOrStripeSubscriptionSource(
                      sub?.source ?? null
                    );
                    const expired =
                      sub?.expiryDate &&
                      new Date(sub.expiryDate) < new Date();
                    return (
                      <TableRow key={u.uid}>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs">
                          {u.email ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {u.displayName ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.providers.length
                            ? u.providers.map(providerShort).join(", ")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {u.disabled ? (
                            <Badge variant="destructive">Désactivé</Badge>
                          ) : (
                            <Badge variant="secondary">Actif</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub?.isPremium ? (
                            <Badge variant="default">
                              {sub.source ?? "premium"}
                            </Badge>
                          ) : expired ? (
                            <Badge variant="outline">Expiré</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {sub?.isPremium && !sub.expiryDate
                            ? "Illimité"
                            : sub?.expiryDate
                              ? new Date(sub.expiryDate).toLocaleString("fr-FR")
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {u.email && (
                            <div className="flex flex-wrap justify-end gap-1">
                              {subLocked ? (
                                <span className="text-xs text-muted-foreground">
                                  Store / Stripe
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setGrantEmail(u.email!);
                                    document
                                      .getElementById("grant-section")
                                      ?.scrollIntoView({ behavior: "smooth" });
                                  }}
                                >
                                  Abonnement
                                </Button>
                              )}
                              {sub?.isPremium && !subLocked && (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  disabled={revokingEmail === u.email}
                                  onClick={() =>
                                    void revokeSubscription(u.email!)
                                  }
                                >
                                  {revokingEmail === u.email
                                    ? "…"
                                    : "Annuler"}
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {!activeSearch && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:px-6">
            <span>Page {pageIndex + 1}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex === 0 || listLoading}
                onClick={goPrevPage}
              >
                Précédent
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!lastNextPageToken || listLoading}
                onClick={goNextPage}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </section>

      <section
        id="grant-section"
        className="rounded-xl border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium">Attribuer un abonnement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Le compte doit exister dans Firebase Auth (inscription sur le profil).
        </p>

        <form onSubmit={(e) => void grant(e)} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-email">E-mail du compte utilisateur</Label>
            <Input
              id="target-email"
              type="email"
              autoComplete="off"
              required
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              className="h-10"
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Durée</legend>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="grantMode"
                  checked={grantMode === "date"}
                  onChange={() => setGrantMode("date")}
                  className="h-4 w-4"
                />
                <span>Date de fin</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="grantMode"
                  checked={grantMode === "unlimited"}
                  onChange={() => setGrantMode("unlimited")}
                  className="h-4 w-4"
                />
                <span>Illimité</span>
              </label>
            </div>
          </fieldset>
          {grantMode === "date" && (
            <div className="space-y-2">
              <Label htmlFor="exp">Fin d’abonnement</Label>
              <Input
                id="exp"
                type="datetime-local"
                required={grantMode === "date"}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-10"
              />
            </div>
          )}
          {grantMode === "unlimited" && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              L’utilisateur restera premium tant que vous ne modifiez pas ou ne
              résiliez pas l’abonnement (pas de date d’expiration enregistrée).
            </p>
          )}
          {grantTargetLocked && (
            <p
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
              role="status"
            >
              Cet utilisateur a un abonnement géré par Stripe ou les stores :
              modification impossible depuis l’admin.
            </p>
          )}
          <Button
            type="submit"
            disabled={grantPending || grantTargetLocked}
          >
            {grantPending ? "Enregistrement…" : "Activer l’abonnement"}
          </Button>
        </form>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/" className="text-primary underline">
          Retour au profil
        </Link>
      </p>
    </div>
  );
}
