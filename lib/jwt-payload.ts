/** Décode le payload d'un JWT (sans vérification de signature). */
export function decodeJwtPayload<T extends Record<string, unknown>>(
  jwt: string
): T {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    throw new Error("JWT invalide");
  }
  const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, "base64").toString("utf8");
  return JSON.parse(json) as T;
}
