/**
 * Lecture unique du statut premium Firestore (profil, SSO, stats).
 * Évite les divergences entre `=== true` / `instanceof Timestamp` et le reste de l’API.
 */
export function parseUserExpiryMs(
  data: Record<string, unknown> | undefined
): number | null {
  const exp = data?.expiryDate;
  if (exp == null) return null;
  if (typeof (exp as { toDate?: () => Date }).toDate === "function") {
    return (exp as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof exp === "object" && exp !== null && "seconds" in exp) {
    const s = Number((exp as { seconds: unknown }).seconds);
    if (Number.isFinite(s)) {
      const nanos = Number((exp as { nanoseconds?: unknown }).nanoseconds ?? 0);
      return s * 1000 + nanos / 1e6;
    }
  }
  return null;
}

/** Même règle que GET /api/profile/subscription */
export function isUserPremiumActive(
  data: Record<string, unknown> | undefined
): boolean {
  if (!data) return false;
  const expiryMs = parseUserExpiryMs(data);
  const expiredByDate = expiryMs != null && expiryMs < Date.now();
  return Boolean(data.isPremium && !expiredByDate);
}
