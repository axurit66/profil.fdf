/**
 * Import des abonnements actifs depuis un export CSV (ancienne app) → Firestore users/* (source admin).
 *
 * Usage :
 *   node --env-file=.env.local scripts/import-iap-subscribers.mjs --csv chemin/export.csv [--dry-run]
 *
 * Si l’e-mail n’existe pas dans Firebase Auth, un compte est créé (sans mot de passe : réinit. mot de passe).
 * Colonnes attendues : email, renew_sub_date, expire_sub_at, product_id (en-têtes export IAP).
 * Date de fin : le maximum des dates valides parmi renew_sub_date et expire_sub_at.
 */

import { readFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    /* .env.local absent */
  }
}

loadEnv(resolve(ROOT, ".env.local"));

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const csvArgIdx = args.indexOf("--csv");
const CSV_PATH =
  csvArgIdx !== -1 && args[csvArgIdx + 1]
    ? resolve(args[csvArgIdx + 1])
    : resolve(ROOT, "export-iap-active-11-05-2026-17_05.csv");

/** @param {string} line */
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

/** @param {string} raw */
function parseDate(raw) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** @param {string | undefined} src */
function isStoreOrStripeSubscriptionSource(src) {
  return src === "stripe" || src === "ios" || src === "android";
}

/**
 * @param {string} renewRaw
 * @param {string} expireRaw
 */
function resolveExpiryDate(renewRaw, expireRaw) {
  const a = parseDate(renewRaw);
  const b = parseDate(expireRaw);
  if (a && b) return a.getTime() > b.getTime() ? a : b;
  return a ?? b ?? null;
}

const { initializeApp, cert, getApps } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = await import(
  "firebase-admin/firestore"
);

const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY ?? "";
const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Variables manquantes : FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
  );
  process.exit(1);
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * @returns {Promise<Map<string, { expiresAt: Date, productId: string, userIds: string[], displayName?: string }>>}
 */
async function readSubscriptionsByEmail(csvPath) {
  /** @type {Map<string, { expiresAt: Date, productId: string, userIds: string[], displayName?: string }>} */
  const byEmail = new Map();

  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headers = [];
  let isHeader = true;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);

    if (isHeader) {
      headers = fields.map((h) => h.trim().toLowerCase());
      isHeader = false;
      continue;
    }

    const row = Object.fromEntries(
      headers.map((h, i) => [h, (fields[i] ?? "").trim()])
    );

    const email = (row["email"] ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    const expiresAt = resolveExpiryDate(
      row["renew_sub_date"] ?? "",
      row["expire_sub_at"] ?? ""
    );
    if (!expiresAt) continue;

    const productId = (row["product_id"] ?? "legacy").trim() || "legacy";
    const userId = (row["user_id"] ?? "").trim();
    const firstName = (row["first_name"] ?? "").trim();
    const lastName = (row["last_name"] ?? "").trim();
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, {
        expiresAt,
        productId,
        userIds: userId ? [userId] : [],
        ...(displayName ? { displayName } : {}),
      });
    } else {
      if (expiresAt.getTime() > prev.expiresAt.getTime()) {
        prev.expiresAt = expiresAt;
        prev.productId = productId;
        if (displayName) prev.displayName = displayName;
      } else if (displayName && !prev.displayName) {
        prev.displayName = displayName;
      }
      if (userId && !prev.userIds.includes(userId)) prev.userIds.push(userId);
    }
  }

  return byEmail;
}

const now = Date.now();

console.log(`CSV: ${CSV_PATH}`);
console.log(`Dry-run: ${DRY_RUN ? "oui" : "non"}`);
console.log(`Projet: ${projectId}\n`);

const byEmail = await readSubscriptionsByEmail(CSV_PATH);
console.log(`Lignes avec e-mail + date de fin : ${byEmail.size}\n`);

let granted = 0;
let skippedPast = 0;
let authCreated = 0;
let skippedManaged = 0;
let errors = 0;

for (const [email, meta] of byEmail) {
  if (meta.expiresAt.getTime() <= now) {
    skippedPast++;
    console.log(`[skip expiré] ${email}`);
    continue;
  }

  let uid;
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
  } catch (lookupErr) {
    const lookupCode =
      lookupErr &&
      typeof lookupErr === "object" &&
      "code" in lookupErr
        ? String(/** @type {{ code?: string }} */ (lookupErr).code)
        : "";
    if (lookupCode !== "auth/user-not-found") {
      errors++;
      console.error(`[erreur Auth lookup] ${email}`, lookupErr);
      continue;
    }

    if (DRY_RUN) {
      authCreated++;
      granted++;
      console.log(
        `[dry-run Auth+premium] ${email} (nouveau compte) → ${meta.expiresAt.toISOString()}`
      );
      continue;
    }

    try {
      /** @type {{ email: string, emailVerified: boolean, displayName?: string }} */
      const createReq = { email, emailVerified: true };
      if (meta.displayName) createReq.displayName = meta.displayName;
      const created = await auth.createUser(createReq);
      uid = created.uid;
      authCreated++;
      console.log(
        `[Auth créé] ${email} — premium jusqu’au ${meta.expiresAt.toISOString()}`
      );
    } catch (createErr) {
      const createCode =
        createErr &&
        typeof createErr === "object" &&
        "code" in createErr
          ? String(/** @type {{ code?: string }} */ (createErr).code)
          : "";
      if (createCode === "auth/email-already-exists") {
        try {
          const u = await auth.getUserByEmail(email);
          uid = u.uid;
        } catch {
          errors++;
          console.error(`[erreur Auth après doublon] ${email}`, createErr);
          continue;
        }
      } else {
        errors++;
        console.error(`[erreur création Auth] ${email}`, createErr);
        continue;
      }
    }
  }

  const snap = await db.collection("users").doc(uid).get();
  const src = snap.data()?.source;
  if (isStoreOrStripeSubscriptionSource(src)) {
    skippedManaged++;
    console.log(`[skip source store/stripe] ${email} (${src})`);
    continue;
  }

  if (DRY_RUN) {
    granted++;
    console.log(`[dry-run OK] ${email} → ${meta.expiresAt.toISOString()}`);
    continue;
  }

  try {
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          email,
          ...(meta.displayName ? { displayName: meta.displayName } : {}),
          isPremium: true,
          status: "active",
          source: "admin",
          productId: `iap-migration:${meta.productId}`,
          expiryDate: Timestamp.fromDate(meta.expiresAt),
          iapUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    granted++;
    console.log(`[OK] ${email}`);
  } catch (e) {
    errors++;
    console.error(`[erreur] ${email}`, e);
  }
}

console.log("\n--- Résumé ---");
console.log(`Attribués: ${granted}`);
console.log(`Expirés (date ≤ maintenant): ${skippedPast}`);
console.log(`Nouveaux comptes Firebase Auth: ${authCreated}`);
console.log(`Déjà gérés store/Stripe: ${skippedManaged}`);
console.log(`Erreurs Firestore: ${errors}`);

process.exit(errors > 0 ? 1 : 0);
