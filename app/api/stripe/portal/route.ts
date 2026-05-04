import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { adminAuth } from "@/lib/firebase-admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const user = await adminAuth.getUser(uid);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  const customerId = await getOrCreateStripeCustomer(
    uid,
    user.email ?? undefined
  );

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/subscription`,
  });

  return NextResponse.json({ url: session.url });
}
