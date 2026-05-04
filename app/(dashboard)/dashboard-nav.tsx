"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getMainSiteUrl } from "@/lib/main-site";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Profil" },
  { href: "/account", label: "Mon compte" },
  { href: "/subscription", label: "Abonnement" },
  { href: "/invoices", label: "Factures" },
  { href: "/help", label: "Aide" },
];

export function DashboardNav({
  email,
  displayName,
  photoURL,
  showInvoicesTab = true,
}: {
  email: string;
  displayName: string | undefined;
  photoURL: string | undefined;
  showInvoicesTab?: boolean;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const visibleLinks = showInvoicesTab
    ? links
    : links.filter((l) => l.href !== "/invoices");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoURL}
            alt=""
            className="h-10 w-10 rounded-full border object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted text-sm font-medium">
            {(displayName || email || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {displayName || "Utilisateur"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {visibleLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
              pathname === l.href && "bg-muted font-medium"
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <a
        href={getMainSiteUrl()}
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
      >
        Feux de forêt — site principal
      </a>
      <Button variant="outline" className="w-full" onClick={() => void signOut()}>
        Déconnexion
      </Button>
    </div>
  );
}
