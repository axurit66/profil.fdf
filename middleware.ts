import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * Garde légère : cookie de session présent (la vérif complète est faite côté serveur
 * dans le layout dashboard, avec Firebase Admin — incompatible Edge).
 */
export function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    const login = new URL("/login", request.url);
    const back =
      request.nextUrl.pathname +
      request.nextUrl.search;
    login.searchParams.set("redirect", back);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/subscription", "/invoices", "/account", "/help"],
};
