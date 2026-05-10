/**
 * Vérifie les règles Firestore sur users/{uid}/sessions/{id} :
 * - lecture client OK si isActive == true
 * - lecture refusée si isActive == false
 *
 * Usage :
 *   FIREBASE_TEST_UID=<uid Auth existant> node --env-file=.env.local scripts/test-session-firestore.cjs
 *   node --env-file=.env.local scripts/test-session-firestore.cjs <uid>
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp: initClientApp, deleteApp } = require("firebase/app");
const { getAuth: getClientAuth, signInWithCustomToken } = require("firebase/auth");
const { getFirestore: getClientDb, doc, getDoc } = require("firebase/firestore");

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

async function main() {
  const uid = process.env.FIREBASE_TEST_UID || process.argv[2];
  if (!uid) {
    console.error(
      "Indiquez un UID Firebase Auth existant, ex. :\n  FIREBASE_TEST_UID=abc123 node --env-file=.env.local scripts/test-session-firestore.cjs"
    );
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  if (!projectId || !clientEmail || !privateKey) {
    console.error("Variables Admin manquantes (FIREBASE_PROJECT_ID, …).");
    process.exit(1);
  }

  const adminApp =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });

  const adminAuth = getAuth(adminApp);
  const adminDb = getFirestore(adminApp);

  await adminAuth.getUser(uid);

  const sessionId = `test-sess-${Date.now()}`;
  const sessionRef = adminDb
    .collection("users")
    .doc(uid)
    .collection("sessions")
    .doc(sessionId);

  const clientAppName = `[session-test-${Date.now()}]`;
  let clientApp;

  try {
    await sessionRef.set({
      sessionId,
      platform: "web",
      deviceInfo: "scripts/test-session-firestore.cjs",
      provider: "email",
      createdAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
      isActive: true,
    });

    const customToken = await adminAuth.createCustomToken(uid);

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || projectId,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
      console.error("Variables NEXT_PUBLIC_FIREBASE_* manquantes.");
      process.exit(1);
    }

    clientApp = initClientApp(firebaseConfig, clientAppName);
    const cAuth = getClientAuth(clientApp);
    const cred = await signInWithCustomToken(cAuth, customToken);
    await cred.user.getIdToken();

    const cDb = getClientDb(clientApp);
    const snapActive = await getDoc(
      doc(cDb, "users", uid, "sessions", sessionId)
    );

    if (!snapActive.exists() || snapActive.data()?.isActive !== true) {
      console.error(
        "ÉCHEC : lecture client impossible alors que isActive=true.",
        snapActive.exists(),
        snapActive.data()
      );
      process.exit(1);
    }
    console.log("OK : lecture client avec session active (règles Firestore).");

    await sessionRef.set({ isActive: false }, { merge: true });

    let denied = false;
    try {
      await getDoc(doc(cDb, "users", uid, "sessions", sessionId));
    } catch (e) {
      if (
        e?.code === "permission-denied" ||
        String(e?.message || "").toLowerCase().includes("permission")
      ) {
        denied = true;
      } else {
        throw e;
      }
    }

    if (!denied) {
      console.error(
        "ÉCHEC : la lecture devrait être refusée après isActive=false."
      );
      process.exit(1);
    }
    console.log("OK : lecture refusée après révocation (isActive=false).");
    console.log("Test terminé avec succès.");
  } finally {
    await sessionRef.delete().catch(() => {});
    if (clientApp) {
      await deleteApp(clientApp).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
