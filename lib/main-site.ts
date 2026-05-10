/** Même périmètre que `isAllowedWordPressReturnUrl` (SSO) : évite une redirection ouverte. */
function isAllowedFeuxdeforetHttpsUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") {
      return false;
    }
    const host = u.hostname.toLowerCase();
    return host === "feuxdeforet.fr" || host.endsWith(".feuxdeforet.fr");
  } catch {
    return false;
  }
}

/** Site principal (ex. feuxdeforet.fr), utilisé pour le CTA « retour au site ». */
export function getMainSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_POST_LOGIN_URL?.trim() || "https://feuxdeforet.fr"
  );
}

/**
 * URL absolue après déconnexion utilisateur (Firebase + cookie session).
 * Si absent ou invalide : le client garde la redirection vers `/login?redirect=…`.
 */
export function getLogoutUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_LOGOUT_URL?.trim();
  if (!raw) {
    return null;
  }
  return isAllowedFeuxdeforetHttpsUrl(raw) ? raw : null;
}
