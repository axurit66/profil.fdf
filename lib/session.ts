/** Cookie httpOnly contenant la session Firebase (createSessionCookie). */
export const SESSION_COOKIE_NAME = "firebase_session";

/** Durée alignée sur createSessionCookie (max 14 jours ; ici 5 jours). */
export const SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000;
