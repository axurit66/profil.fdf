import { getMainSiteUrl } from "@/lib/main-site";

/** Aligné sur middleware.ts matcher + racine tableau de bord profil. */
function isProfilInternalPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") {
    return true;
  }
  const roots = ["/subscription", "/invoices", "/account", "/help"];
  for (const r of roots) {
    if (pathname === r || pathname.startsWith(`${r}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Après login : pose du cookie `fdf_auth` via `/api/auth/sso` avant WordPress ;
 * reste sur le profil si `redirect` pointe vers une page interne (matcher).
 */
export function getPostLoginDestination(redirectPath: string | null): string {
  if (typeof window === "undefined") {
    return getMainSiteUrl();
  }
  if (
    redirectPath &&
    redirectPath.startsWith("/") &&
    !redirectPath.startsWith("//")
  ) {
    try {
      const u = new URL(redirectPath, window.location.origin);
      if (u.pathname === "/api/auth/sso") {
        return u.href;
      }
      if (isProfilInternalPath(u.pathname)) {
        return new URL(redirectPath, window.location.origin).href;
      }
      return new URL(redirectPath, window.location.origin).href;
    } catch {
      /* SSO par défaut */
    }
  }
  const sso = new URL("/api/auth/sso", window.location.origin);
  sso.searchParams.set("redirect", getMainSiteUrl());
  return sso.href;
}

/**
 * Après `onAuthStateChanged` + cookie session (AuthContext), recharge complète vers la cible.
 * Retourne une fonction de cleanup (clearTimeout) pour React Strict Mode / deps qui changent.
 */
export function setupPostLoginReload(postLoginPath: string | null): () => void {
  const href = getPostLoginDestination(postLoginPath);
  const id = window.setTimeout(() => {
    window.location.replace(href);
  }, 300);
  return () => window.clearTimeout(id);
}
