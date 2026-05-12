/**
 * Vérifie un token Cloudflare Turnstile auprès de notre route serveur.
 * Retourne `true` si le token est valide.
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
