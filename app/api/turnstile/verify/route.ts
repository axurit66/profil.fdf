import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function POST(request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Captcha non configuré." },
      { status: 500 }
    );
  }

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide." },
      { status: 400 }
    );
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      { error: "Captcha manquant." },
      { status: 400 }
    );
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const remoteIp = forwarded?.split(",")[0]?.trim();

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (remoteIp) params.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return NextResponse.json(
        {
          error: "Captcha invalide.",
          codes: data["error-codes"] ?? [],
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/turnstile/verify]", err);
    return NextResponse.json(
      { error: "Erreur lors de la vérification du captcha." },
      { status: 502 }
    );
  }
}
