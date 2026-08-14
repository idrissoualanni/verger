import { NextResponse, type NextRequest } from "next/server";

/**
 * Protection de routage : pas de cookie de session → /login.
 * La vraie validation de la session se fait côté API (worker) à chaque requête.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Routes publiques — aucune vérification de session
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/tarifs") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has("better-auth.session_token");

  if (!hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
