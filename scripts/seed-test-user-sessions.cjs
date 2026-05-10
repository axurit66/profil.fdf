/**
 * Aligne les sessions Firestore d’un utilisateur de test sur la limite métier
 * (MAX_CONCURRENT_USER_SESSIONS = 3 dans lib/session-service.ts) :
 * - désactive les plus anciennes si plus de 3 actives ;
 * - crée des sessions jusqu’à en avoir exactement 3 actives.
 *
 * Usage : node --env-file=.env.local scripts/seed-test-user-sessions.cjs
 * Variable optionnelle : TEST_USER_EMAIL (défaut test@fdf.fr)
 */

const crypto = require("crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

/** Aligné sur lib/session-service.ts */
const MAX_ACTIVE_SESSIONS = 3;

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

function createdAtMillis(doc) {
  const ts = doc.get("createdAt");
  if (ts instanceof Timestamp) return ts.toMillis();
  return 0;
}

async function main() {
  const email = (process.env.TEST_USER_EMAIL || "test@fdf.fr").trim().toLowerCase();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  if (!projectId || !clientEmail || !privateKey) {
    console.error("Variables Admin manquantes.");
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

  let user;
  try {
    user = await adminAuth.getUserByEmail(email);
  } catch {
    console.error(`Aucun compte Firebase Auth pour : ${email}`);
    process.exit(1);
  }

  const uid = user.uid;
  const coll = adminDb.collection("users").doc(uid).collection("sessions");

  const snap = await coll.get();
  const activeDocs = snap.docs.filter((d) => d.get("isActive") === true);
  const sortedActive = activeDocs
    .slice()
    .sort((a, b) => createdAtMillis(a) - createdAtMillis(b));

  if (sortedActive.length > MAX_ACTIVE_SESSIONS) {
    const toRevoke = sortedActive.slice(
      0,
      sortedActive.length - MAX_ACTIVE_SESSIONS
    );
    for (const d of toRevoke) {
      await d.ref.set({ isActive: false }, { merge: true });
      console.log(`Désactivée (limite 3) : ${d.id}`);
    }
  }

  let activeCount = (
    await coll.get()
  ).docs.filter((d) => d.get("isActive") === true).length;

  let added = 0;
  while (activeCount < MAX_ACTIVE_SESSIONS) {
    added += 1;
    const sessionId = crypto.randomUUID();
    await coll.doc(sessionId).set({
      sessionId,
      platform: "web",
      deviceInfo: `Seed test ${added}/${MAX_ACTIVE_SESSIONS} (${new Date().toISOString()})`,
      provider: "email",
      createdAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
      isActive: true,
    });
    console.log(`Session créée : ${sessionId}`);
    activeCount += 1;
  }

  console.log(
    `Terminé pour ${email} (uid=${uid}) : exactement ${MAX_ACTIVE_SESSIONS} session(s) active(s).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
