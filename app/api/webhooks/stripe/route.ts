import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { findUidByStripeCustomerId } from "@/lib/firestore-users";
import { stripe } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/stripe-subscription-sync";

export const runtime = "nodejs";

function customerIdFrom(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

/** Abonnement lié à une facture (API récente : parent.subscription_details). */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (
    parent &&
    parent.type === "subscription_details" &&
    parent.subscription_details
  ) {
    const sub = parent.subscription_details.subscription;
    if (typeof sub === "string") return sub;
    if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  }
  const legacy = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;
  return null;
}

async function handleSubscriptionWebhook(
  sub: Stripe.Subscription,
  eventType: string
): Promise<void> {
  const cid = customerIdFrom(sub.customer);
  if (!cid) {
    console.warn("[stripe webhook]", eventType, "customer introuvable");
    return;
  }
  const uid = await findUidByStripeCustomerId(cid);
  if (!uid) {
    console.warn(
      "[stripe webhook]",
      eventType,
      "aucun utilisateur Firestore pour stripeCustomerId",
      cid
    );
    return;
  }
  await syncStripeSubscription(uid, sub, eventType);
  console.log("[stripe webhook]", eventType, "traité", {
    uid,
    customerId: cid,
    subscriptionId: sub.id,
    stripeStatus: sub.status,
  });
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = customerIdFrom(
    invoice.customer as Stripe.Invoice["customer"]
  );
  if (!customerId) {
    console.warn("[stripe webhook] invoice.payment_failed sans customer");
    return;
  }
  const uid = await findUidByStripeCustomerId(customerId);
  if (!uid) {
    console.warn(
      "[stripe webhook] invoice.payment_failed aucun user pour customer",
      customerId
    );
    return;
  }
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) {
    console.log(
      "[stripe webhook] invoice.payment_failed ignoré (pas d’abonnement)",
      { customerId }
    );
    return;
  }
  const sub = await stripe.subscriptions.retrieve(subId);
  if (sub.status !== "past_due" && sub.status !== "unpaid") {
    console.log("[stripe webhook] invoice.payment_failed ignoré", {
      uid,
      subscriptionId: subId,
      stripeStatus: sub.status,
    });
    return;
  }
  await syncStripeSubscription(uid, sub, "invoice.payment_failed");
  console.log("[stripe webhook] invoice.payment_failed traité", {
    uid,
    subscriptionId: subId,
    stripeStatus: sub.status,
  });
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = customerIdFrom(
    invoice.customer as Stripe.Invoice["customer"]
  );
  if (!customerId) {
    console.warn("[stripe webhook] invoice.payment_succeeded sans customer");
    return;
  }
  const uid = await findUidByStripeCustomerId(customerId);
  if (!uid) {
    console.warn(
      "[stripe webhook] invoice.payment_succeeded aucun user pour customer",
      customerId
    );
    return;
  }
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) {
    console.log(
      "[stripe webhook] invoice.payment_succeeded ignoré (pas d’abonnement)",
      { customerId }
    );
    return;
  }
  const sub = await stripe.subscriptions.retrieve(subId);
  await syncStripeSubscription(uid, sub, "invoice.payment_succeeded");
  console.log("[stripe webhook] invoice.payment_succeeded traité", {
    uid,
    subscriptionId: subId,
    stripeStatus: sub.status,
  });
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
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionWebhook(sub, event.type);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
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
