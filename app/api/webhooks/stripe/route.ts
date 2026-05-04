import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin";
import { updateSubscriptionStatus } from "@/lib/firestore";
import { findUidByStripeCustomerId } from "@/lib/firestore-users";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

function customerIdFrom(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

async function handleStripeSubscription(
  sub: Stripe.Subscription,
  customerId: string
): Promise<void> {
  const uid = await findUidByStripeCustomerId(customerId);
  if (!uid) {
    console.warn("[stripe] aucun utilisateur pour customer", customerId);
    return;
  }

  const stripeStatus = sub.status;
  const isActive = stripeStatus === "active" || stripeStatus === "trialing";
  const isCanceledLike =
    stripeStatus === "canceled" ||
    stripeStatus === "incomplete_expired" ||
    stripeStatus === "unpaid";

  const subStatus = isActive
    ? "active"
    : isCanceledLike
      ? "canceled"
      : "expired";

  const priceId = sub.items.data[0]?.price?.id;
  const periodEndSec = sub.current_period_end;

  await adminDb
    .collection("users")
    .doc(uid)
    .set(
      {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
      },
      { merge: true }
    );

  await updateSubscriptionStatus(uid, subStatus, {
    source: "stripe",
    productId: priceId,
    expiresAt: periodEndSec ? periodEndSec * 1000 : undefined,
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = customerIdFrom(
    invoice.customer as Stripe.Invoice["customer"]
  );
  if (!customerId) return;
  const uid = await findUidByStripeCustomerId(customerId);
  if (!uid) return;
  await updateSubscriptionStatus(uid, "expired", { source: "stripe" });
}

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Configuration Stripe." }, { status: 500 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    console.error("[stripe webhook] signature", e);
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerIdFrom(sub.customer);
        if (cid) await handleStripeSubscription(sub, cid);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerIdFrom(sub.customer);
        if (!cid) break;
        const uid = await findUidByStripeCustomerId(cid);
        if (uid) {
          await adminDb.collection("users").doc(uid).set(
            { stripeSubscriptionId: null },
            { merge: true }
          );
          await updateSubscriptionStatus(uid, "canceled", { source: "stripe" });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] traitement", e);
  }

  return NextResponse.json({ received: true });
}
