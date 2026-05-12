"use client";

import { createRoot } from "react-dom/client";

const OVERLAY_ROOT_ID = "fdf-post-login-redirect-overlay";

export function PostLoginRedirectingScreen() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-white">
      <p className="text-muted-foreground">Redirection en cours…</p>
    </div>
  );
}

/** Couvre tout le document pendant le retour OAuth (hors pages login/register). */
export function attachPostLoginRedirectingOverlay(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ROOT_ID)) return;
  const el = document.createElement("div");
  el.id = OVERLAY_ROOT_ID;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  createRoot(el).render(
    <div className="fixed inset-0 z-[100000] bg-white">
      <PostLoginRedirectingScreen />
    </div>
  );
}
