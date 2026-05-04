import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function getPrivateKey(): string {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

let cachedApp: App | undefined;

function getAdminApp(): App {
  if (cachedApp) {
    return cachedApp;
  }
  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY sont requis."
    );
  }
  cachedApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
  return cachedApp;
}

function authInstance(): Auth {
  return getAuth(getAdminApp());
}

function dbInstance(): Firestore {
  return getFirestore(getAdminApp());
}

/** Accès paresseux pour éviter l’init au chargement du module (build). */
export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const auth = authInstance();
    const value = Reflect.get(auth as object, prop, receiver);
    if (typeof value === "function") {
      return value.bind(auth);
    }
    return value;
  },
});

export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const db = dbInstance();
    const value = Reflect.get(db as object, prop, receiver);
    if (typeof value === "function") {
      return value.bind(db);
    }
    return value;
  },
});
