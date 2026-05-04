/**
 * Relie des abonnements Stripe à leur utilisateur Firebase Auth + Firestore.
 *
 * Usage :
 *   node scripts/link-stripe.mjs [--dry-run] email1 email2 ...
 *
 * Pour chaque email :
 *   1. Récupère le client Stripe (par email) et son abonnement actif
 *   2. Trouve l'utilisateur Firebase Auth (par email)
 *   3. Écrit dans Firestore : stripeCustomerId, stripeSubscriptionId,
 *      isPremium, expiryDate, source = "stripe"
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── .env.local ────────────────────────────────────────────────────────────────

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
  } catch { /* variables système */ }
}

loadEnv(resolve(ROOT, ".env.local"));

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const emails = args.filter((a) => !a.startsWith("--") && a.includes("@"));

if (emails.length === 0) {
  console.error("Usage : node scripts/link-stripe.mjs [--dry-run] email1 email2 ...");
  process.exit(1);
}

// ── Firebase Admin ────────────────────────────────────────────────────────────

const { initializeApp, cert, getApps } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");

const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌  Variables Firebase manquantes.");
  process.exit(1);
}

const app =
  getApps()[0] ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

const auth = getAuth(app);
const db = getFirestore(app);

// ── Stripe ────────────────────────────────────────────────────────────────────

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error("❌  STRIPE_SECRET_KEY manquant.");
  process.exit(1);
}

const { default: Stripe } = await import("stripe");
const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retourne le premier client Stripe trouvé pour cet email. */
async function findStripeCustomer(email) {
  const list = await stripe.customers.list({ email, limit: 5 });
  if (list.data.length === 0) return null;
  if (list.data.length > 1) {
    console.warn(
      `   ⚠️   ${list.data.length} clients Stripe pour ${email} — on prend le premier actif`
    );
  }
  return list.data[0];
}

/** Retourne le meilleur abonnement Stripe : active > trialing > past_due > autres. */
async function findBestSubscription(customerId) {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    limit: 10,
    status: "all",
  });

  const priority = ["active", "trialing", "past_due", "incomplete", "unpaid", "canceled"];
  subs.data.sort(
    (a, b) => priority.indexOf(a.status) - priority.indexOf(b.status)
  );
  return subs.data[0] ?? null;
}

// ── Traitement par email ──────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════");
console.log("  Liaison abonnements Stripe → Firebase");
console.log("═══════════════════════════════════════════════════════");
console.log(`  Projet   : ${projectId}`);
console.log(`  Dry-run  : ${DRY_RUN ? "OUI" : "non"}`);
console.log(`  Emails   : ${emails.join(", ")}`);
console.log("═══════════════════════════════════════════════════════\n");

let ok = 0;
let ko = 0;

for (const email of emails) {
  console.log(`\n──────────────────────────────────────`);
  console.log(`📧  ${email}`);

  // 1. Client Stripe
  let customer;
  try {
    customer = await findStripeCustomer(email);
  } catch (e) {
    console.error(`   ❌  Stripe lookup : ${e.message}`);
    ko++;
    continue;
  }

  if (!customer) {
    console.error(`   ❌  Aucun client Stripe trouvé pour cet email`);
    ko++;
    continue;
  }
  console.log(`   ✅  Client Stripe  : ${customer.id} (${customer.name || "sans nom"})`);

  // 2. Abonnement Stripe
  let sub;
  try {
    sub = await findBestSubscription(customer.id);
  } catch (e) {
    console.error(`   ❌  Stripe subscriptions : ${e.message}`);
    ko++;
    continue;
  }

  if (!sub) {
    console.warn(`   ⚠️   Aucun abonnement Stripe trouvé`);
  } else {
    const firstItem = sub.items.data[0];
    const priceId =
      typeof firstItem?.price === "object" && firstItem.price
        ? firstItem.price.id
        : typeof firstItem?.price === "string"
          ? firstItem.price
          : "?";
    const periodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : "?";

    console.log(`   ✅  Abonnement     : ${sub.id}`);
    console.log(`       Statut         : ${sub.status}`);
    console.log(`       Price ID       : ${priceId}`);
    console.log(`       Fin de période : ${periodEnd}`);
  }

  // 3. Utilisateur Firebase Auth
  let fbUser;
  try {
    fbUser = await auth.getUserByEmail(email);
  } catch {
    // Utilisateur absent → on le crée
    console.warn(`   ⚠️   Absent de Firebase Auth — création…`);
    if (!DRY_RUN) {
      try {
        fbUser = await auth.createUser({
          email,
          emailVerified: true,
        });
        console.log(`   ✅  Créé dans Firebase Auth : ${fbUser.uid}`);
      } catch (e) {
        console.error(`   ❌  Création Firebase Auth : ${e.message}`);
        ko++;
        continue;
      }
    } else {
      console.log(`   [dry-run] création Firebase Auth ignorée`);
      ok++;
      continue;
    }
  }
  console.log(`   ✅  Firebase UID   : ${fbUser.uid}`);

  // 4. Mise à jour Firestore
  const isActive =
    sub &&
    (sub.status === "active" ||
      sub.status === "trialing" ||
      sub.status === "past_due");

  const firstItem = sub?.items.data[0];
  const priceId =
    typeof firstItem?.price === "object" && firstItem.price
      ? firstItem.price.id
      : typeof firstItem?.price === "string"
        ? firstItem.price
        : undefined;
  const periodEndSec = firstItem?.current_period_end;

  const updates = {
    stripeCustomerId: customer.id,
    ...(sub ? { stripeSubscriptionId: sub.id } : {}),
    isPremium: isActive,
    source: "stripe",
    iapUpdatedAt: new Date(),
    ...(isActive && periodEndSec
      ? { expiryDate: Timestamp.fromDate(new Date(periodEndSec * 1000)) }
      : {}),
    ...(priceId ? { productId: priceId } : {}),
  };

  console.log(`   📝  Firestore ← isPremium:${isActive}, stripeCustomerId:${customer.id}`);

  if (!DRY_RUN) {
    try {
      await db.collection("users").doc(fbUser.uid).set(updates, { merge: true });
      console.log(`   ✅  Firestore mis à jour`);
      ok++;
    } catch (e) {
      console.error(`   ❌  Firestore : ${e.message}`);
      ko++;
    }
  } else {
    console.log(`   [dry-run] écriture Firestore ignorée`);
    ok++;
  }
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Résumé");
console.log("═══════════════════════════════════════════════════════");
console.log(`  ✅  Succès : ${ok}`);
console.log(`  ❌  Erreurs : ${ko}`);
console.log("═══════════════════════════════════════════════════════\n");

process.exit(ko > 0 ? 1 : 0);
