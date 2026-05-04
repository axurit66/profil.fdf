import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/auth-api";
import { isHelpMailConfigured, sendHelpRequestEmail } from "@/lib/help-mail";

export const runtime = "nodejs";

const SUBSCRIPTION_OPTIONS: Record<string, string> = {
  application: "L'application",
  web: "Le site web",
  none: "Je ne suis pas abonné·e",
  other: "Autre",
};

export async function POST(request: Request) {
  const auth = await requireBearerUid(request);
  if (auth instanceof NextResponse) return auth;

  if (!isHelpMailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Envoi d'e-mails non configuré (Gmail API : variables HELP_GMAIL_*).",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const email = typeof o.email === "string" ? o.email.trim() : "";
  const subscriptionKey =
    typeof o.subscriptionOn === "string" ? o.subscriptionOn.trim() : "";
  const subscriptionDate =
    typeof o.subscriptionDate === "string" ? o.subscriptionDate.trim() : "";
  const message = typeof o.message === "string" ? o.message.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Adresse e-mail invalide." },
      { status: 400 }
    );
  }

  if (!SUBSCRIPTION_OPTIONS[subscriptionKey]) {
    return NextResponse.json(
      { error: "Choix « Abonnement souscrit sur » invalide." },
      { status: 400 }
    );
  }

  if (!subscriptionDate) {
    return NextResponse.json(
      { error: "Indiquez la date d'abonnement." },
      { status: 400 }
    );
  }

  if (message.length < 10) {
    return NextResponse.json(
      { error: "Le message doit contenir au moins 10 caractères." },
      { status: 400 }
    );
  }

  if (message.length > 12000) {
    return NextResponse.json({ error: "Message trop long." }, { status: 400 });
  }

  try {
    await sendHelpRequestEmail({
      fromUserEmail: email,
      accountUid: auth.uid,
      subscriptionOnLabel: SUBSCRIPTION_OPTIONS[subscriptionKey]!,
      subscriptionDate,
      message,
    });
  } catch (e) {
    console.error("[api/help] send", e);
    return NextResponse.json(
      { error: "L'envoi du message a échoué. Réessayez plus tard." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
