"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionGuard } from "@/components/session-guard";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "./dashboard-nav";

const pathTitles: Record<string, string> = {
  "/": "Profil",
  "/account": "Mon compte",
  "/subscription": "Abonnement",
  "/invoices": "Factures",
  "/help": "Aide",
};

export function DashboardShell({
  children,
  userId,
  email,
  displayName,
  photoURL,
  showInvoicesTab,
}: {
  children: React.ReactNode;
  userId: string;
  email: string;
  displayName: string | undefined;
  photoURL: string | undefined;
  showInvoicesTab: boolean;
}) {
  const pathname = usePathname();
  const title = pathTitles[pathname] ?? "Profil";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-background lg:flex-row">
      <header className="relative sticky top-0 z-30 flex min-h-14 items-center justify-center border-b border-primary-foreground/15 bg-primary px-4 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] text-primary-foreground shadow-sm lg:hidden">
        <span className="sr-only">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 text-primary-foreground hover:bg-primary-foreground/15 sm:left-3"
          onClick={() => setMobileNavOpen(true)}
          aria-expanded={mobileNavOpen}
          aria-controls="dashboard-mobile-nav"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-6 w-6" strokeWidth={2} />
        </Button>
        <Image
          src="/icone.svg"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 select-none drop-shadow-sm"
          priority
        />
      </header>

      <aside className="hidden w-64 shrink-0 border-r bg-card p-4 lg:block">
        <DashboardNav
          email={email}
          displayName={displayName}
          photoURL={photoURL}
          showInvoicesTab={showInvoicesTab}
        />
      </aside>

      {mobileNavOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            aria-hidden
            tabIndex={-1}
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            id="dashboard-mobile-nav"
            className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-env(safe-area-inset-left)-env(safe-area-inset-right)))] flex-col border-r bg-card shadow-xl lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
          >
            <div className="flex items-center justify-end border-b p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <DashboardNav
                email={email}
                displayName={displayName}
                photoURL={photoURL}
                showInvoicesTab={showInvoicesTab}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </div>
          </div>
        </>
      ) : null}

      <main className="min-w-0 flex-1 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <SessionGuard userId={userId}>{children}</SessionGuard>
      </main>
    </div>
  );
}
