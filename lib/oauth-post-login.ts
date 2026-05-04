/** Cible après retour OAuth Firebase (signInWithRedirect). */
export const OAUTH_POST_LOGIN_PATH_KEY = "fdf_oauth_post_login";

const OAUTH_POST_LOGIN_LS_KEY = "fdf_oauth_post_login_ls";

const LOGIN_NEXT_COOKIE = "fdf_login_next";

function cookieSecureSuffix(): string {
  if (typeof location === "undefined") return "";
  return location.protocol === "https:" ? "; Secure" : "";
}

function readLoginNextCookiePath(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${LOGIN_NEXT_COOKIE}=`;
  for (const part of document.cookie.split("; ")) {
    if (!part.startsWith(prefix)) continue;
    const raw = part.slice(prefix.length);
    try {
      return normalizeOAuthReturnPath(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  return null;
}

/** Évite les redirections ouvertes ; exclut rester sur /login ou /register. */
export function normalizeOAuthReturnPath(raw: string | null): string | null {
  if (raw == null || raw === "") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t === "/login" || t.startsWith("/login?")) return "/";
  if (t === "/register" || t.startsWith("/register?")) return "/";
  return t;
}

/** `?redirect=` puis sessionStorage puis cookie (fallback si le retour OAuth perd le stockage). */
export function readOAuthReturnPathFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = normalizeOAuthReturnPath(
    new URLSearchParams(window.location.search).get("redirect")
  );
  if (fromUrl) return fromUrl;
  const fromSession = normalizeOAuthReturnPath(
    sessionStorage.getItem(OAUTH_POST_LOGIN_PATH_KEY)
  );
  if (fromSession) return fromSession;
  try {
    const fromLs = normalizeOAuthReturnPath(
      localStorage.getItem(OAUTH_POST_LOGIN_LS_KEY)
    );
    if (fromLs) return fromLs;
  } catch {
    /* Safari mode privé */
  }
  return readLoginNextCookiePath();
}

export function storeOAuthPostLoginPath(path: string): void {
  sessionStorage.setItem(OAUTH_POST_LOGIN_PATH_KEY, path);
  try {
    localStorage.setItem(OAUTH_POST_LOGIN_LS_KEY, path);
  } catch {
    /* mode privé */
  }
  if (typeof document !== "undefined") {
    const enc = encodeURIComponent(path);
    document.cookie = `${LOGIN_NEXT_COOKIE}=${enc}; Path=/; Max-Age=600; SameSite=Lax${cookieSecureSuffix()}`;
  }
}

export function clearOAuthPostLoginPath(): void {
  sessionStorage.removeItem(OAUTH_POST_LOGIN_PATH_KEY);
  try {
    localStorage.removeItem(OAUTH_POST_LOGIN_LS_KEY);
  } catch {
    /* */
  }
  if (typeof document !== "undefined") {
    document.cookie = `${LOGIN_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureSuffix()}`;
  }
}
