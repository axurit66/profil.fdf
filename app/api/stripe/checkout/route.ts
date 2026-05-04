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

  let body: { priceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  if (!body.priceId) {
    return NextResponse.json({ error: "priceId requis." }, { status: 400 });
  }

  const user = await adminAuth.getUser(uid);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  const customerId = await getOrCreateStripeCustomer(
    uid,
    user.email ?? undefined
  );

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: body.priceId, quantity: 1 }],
    success_url: `${baseUrl}/subscription?success=true`,
    cancel_url: `${baseUrl}/subscription`,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Impossible de créer la session." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: session.url });
}
