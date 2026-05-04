/**
 * Import des utilisateurs WordPress → Firebase Auth + Firestore
 *
 * Usage :
 *   node scripts/import-users.mjs [--dry-run] [--firestore] [--csv chemin/vers/users.csv] [--uid-prefix préfixe]
 *
 * Options :
 *   --dry-run          Simule l'import sans rien écrire dans Firebase
 *   --firestore        Écrit aussi les métadonnées dans Firestore (collection "users")
 *   --csv <path>       Chemin vers le CSV (défaut : users.csv à la racine)
 *   --uid-prefix <px>  Préfixe des UIDs Firebase (défaut : "wp_" ou "iap_" selon les colonnes détectées)
 *
 * Le script charge automatiquement .env.local depuis la racine du projet.
 *
 * Les utilisateurs sont créés sans mot de passe (emailVerified = true).
 * Ils devront utiliser "Mot de passe oublié" pour se connecter.
 *
 * Firebase importUsers() accepte 1 000 entrées par appel.
 * Le script traite les utilisateurs déjà existants sans s'arrêter.
 */

import { readFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Chargement de .env.local ─────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Fichier absent — on continue avec les variables d'env système
  }
}

loadEnv(resolve(ROOT, ".env.local"));

// ── Arguments CLI ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const WITH_FIRESTORE = args.includes("--firestore");
const csvArgIdx = args.indexOf("--csv");
const CSV_PATH =
  csvArgIdx !== -1 && args[csvArgIdx + 1]
    ? resolve(args[csvArgIdx + 1])
    : resolve(ROOT, "users.csv");

const uidPrefixArgIdx = args.indexOf("--uid-prefix");
const UID_PREFIX_OVERRIDE =
  uidPrefixArgIdx !== -1 && args[uidPrefixArgIdx + 1]
    ? args[uidPrefixArgIdx + 1]
    : null;

// ── Firebase Admin ────────────────────────────────────────────────────────────

const { initializeApp, cert, getApps } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const firestoreModule = WITH_FIRESTORE
  ? await import("firebase-admin/firestore")
  : null;

const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY ?? "";
const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "❌  Variables manquantes : FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
  );
  process.exit(1);
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

const auth = getAuth(app);
const db = firestoreModule ? firestoreModule.getFirestore(app) : null;

// ── Lecture du CSV ────────────────────────────────────────────────────────────

/**
 * Parse une ligne CSV en tenant compte des champs entre guillemets.
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Détecte le format du CSV selon les colonnes présentes et retourne
 * les utilisateurs normalisés + le préfixe UID à utiliser.
 *
 * Formats supportés :
 *  - WordPress  : id, user_email, display_name, user_registered  → uid "wp_<id>"
 *  - IAP/CRM    : user_id, first_name, last_name, email          → uid "iap_<user_id>"
 */
async function readUsers(csvPath) {
  return new Promise((resolve, reject) => {
    const users = [];
    const rl = createInterface({
      input: createReadStream(csvPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    let isHeader = true;
    let headers = [];
    let detectedPrefix = "wp_";

    rl.on("line", (line) => {
      if (!line.trim()) return;
      const fields = parseCsvLine(line);

      if (isHeader) {
        headers = fields.map((h) => h.trim().toLowerCase());
        // Détection automatique du format
        if (headers.includes("user_id") && headers.includes("first_name")) {
          detectedPrefix = "iap_";
        }
        isHeader = false;
        return;
      }

      const row = Object.fromEntries(
        headers.map((h, i) => [h, (fields[i] ?? "").trim()])
      );

      let email, displayName, id, registered;

      if (detectedPrefix === "iap_") {
        // Format IAP/CRM : user_id, first_name, last_name, email
        email = row["email"] ?? "";
        const firstName = row["first_name"] ?? "";
        const lastName = row["last_name"] ?? "";
        displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
        id = row["user_id"] ?? "";
        registered = "";
      } else {
        // Format WordPress : id, user_email, display_name, user_registered
        email = row["user_email"] ?? row["email"] ?? "";
        displayName = row["display_name"] ?? row["displayname"] ?? "";
        id = row["id"] ?? "";
        registered = row["user_registered"] ?? row["registered"] ?? "";
      }

      if (!email || !email.includes("@")) return;

      users.push({ email, displayName, wpId: id, registered, _prefix: detectedPrefix });
    });

    rl.on("close", () => resolve(users));
    rl.on("error", reject);
  });
}

// ── Import Firebase Auth (importUsers en batch de 1000) ───────────────────────

const BATCH_SIZE = 1000;

/**
 * @param {{ email: string, displayName: string, wpId: string, registered: string }[]} users
 */
async function importToAuth(users) {
  let totalSuccess = 0;
  let totalErrors = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / BATCH_SIZE);

    console.log(
      `\n📦  Batch Auth ${batchNum}/${totalBatches} — ${batch.length} utilisateurs (${i + 1}–${Math.min(i + BATCH_SIZE, users.length)})`
    );

    if (DRY_RUN) {
      console.log("   [dry-run] — rien n'est envoyé à Firebase");
      totalSuccess += batch.length;
      continue;
    }

    /** @type {import('firebase-admin/auth').UserImportRecord[]} */
    const records = batch.map((u) => ({
      uid: `${UID_PREFIX_OVERRIDE ?? u._prefix}${u.wpId}`,
      email: u.email,
      displayName: u.displayName || undefined,
      emailVerified: true,
    }));

    try {
      const result = await auth.importUsers(records, {
        // Pas de hash : utilisateurs sans mot de passe
        // Ils devront réinitialiser leur mot de passe via "Mot de passe oublié"
      });

      const batchErrors = result.errors.length;
      const batchSuccess = batch.length - batchErrors;
      totalSuccess += batchSuccess;
      totalErrors += batchErrors;

      console.log(`   ✅  ${batchSuccess} créés`);

      if (batchErrors > 0) {
        for (const err of result.errors) {
          const user = batch[err.index];
          // Code 6 = utilisateur déjà existant → pas grave
          if (err.error?.code === "auth/email-already-exists") {
            console.log(`   ⚠️   Déjà existant : ${user.email}`);
          } else {
            console.error(
              `   ❌  [${err.index}] ${user.email} — ${err.error?.message ?? err.error}`
            );
          }
        }
      }
    } catch (err) {
      console.error(`   ❌  Erreur batch ${batchNum} :`, err.message);
      totalErrors += batch.length;
    }
  }

  return { totalSuccess, totalErrors };
}

// ── Import Firestore (métadonnées, optionnel) ─────────────────────────────────

const FIRESTORE_BATCH_SIZE = 500; // Firestore : max 500 writes par batch

/**
 * @param {{ email: string, displayName: string, wpId: string, registered: string }[]} users
 */
async function importToFirestore(users) {
  if (!db) return;

  let written = 0;

  // On a besoin des UIDs Firebase → on les récupère par email
  console.log("\n🔍  Résolution des UIDs Firebase pour Firestore…");

  for (let i = 0; i < users.length; i += FIRESTORE_BATCH_SIZE) {
    const chunk = users.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batchNum = Math.floor(i / FIRESTORE_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / FIRESTORE_BATCH_SIZE);

    console.log(
      `\n📦  Batch Firestore ${batchNum}/${totalBatches} — ${chunk.length} utilisateurs`
    );

    if (DRY_RUN) {
      console.log("   [dry-run] — rien n'est écrit dans Firestore");
      written += chunk.length;
      continue;
    }

    const firestoreBatch = db.batch();
    let batchCount = 0;

    for (const u of chunk) {
      let uid;
      try {
        const userRecord = await auth.getUserByEmail(u.email);
        uid = userRecord.uid;
      } catch {
        // Utilisateur absent d'Auth (import raté) → on skip
        continue;
      }

      const ref = db.collection("users").doc(uid);
      firestoreBatch.set(
        ref,
        {
          email: u.email,
          displayName: u.displayName || null,
          wpId: u.wpId ? Number(u.wpId) : null,
          registeredAt: u.registered
            ? new Date(u.registered.replace(" ", "T") + "Z")
            : null,
          importedAt: new Date(),
        },
        { merge: true }
      );
      batchCount++;
    }

    if (batchCount > 0) {
      await firestoreBatch.commit();
      written += batchCount;
      console.log(`   ✅  ${batchCount} documents Firestore écrits`);
    }
  }

  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════");
console.log("  Import utilisateurs WordPress → Firebase");
console.log("═══════════════════════════════════════════════════════");
console.log(`  Projet   : ${projectId}`);
console.log(`  CSV      : ${CSV_PATH}`);
console.log(`  Dry-run  : ${DRY_RUN ? "OUI" : "non"}`);
console.log(`  Firestore: ${WITH_FIRESTORE ? "OUI" : "non"}`);
console.log("═══════════════════════════════════════════════════════\n");

console.log("📖  Lecture du CSV…");
const users = await readUsers(CSV_PATH);
const detectedPrefix = UID_PREFIX_OVERRIDE ?? users[0]?._prefix ?? "wp_";
console.log(`   ${users.length} utilisateurs valides trouvés`);
console.log(`   Format détecté — préfixe UID : "${detectedPrefix}"\n`);

if (users.length === 0) {
  console.error("❌  Aucun utilisateur à importer.");
  process.exit(1);
}

const { totalSuccess, totalErrors } = await importToAuth(users);

let firestoreWritten = 0;
if (WITH_FIRESTORE) {
  firestoreWritten = await importToFirestore(users);
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Résumé");
console.log("═══════════════════════════════════════════════════════");
console.log(`  Auth — créés avec succès : ${totalSuccess}`);
console.log(`  Auth — erreurs           : ${totalErrors}`);
if (WITH_FIRESTORE) {
  console.log(`  Firestore — écrits       : ${firestoreWritten}`);
}
console.log("═══════════════════════════════════════════════════════\n");

process.exit(totalErrors > 0 ? 1 : 0);
