import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const authEnabled = !!process.env.DATABASE_URL;
  const { pathname } = request.nextUrl;

  // Auth disabled — redirect auth pages to home
  if (!authEnabled) {
    if (
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup")
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Auth enabled — protect dashboard from unauthenticated access
  if (pathname.startsWith("/dashboard")) {
    const sessionCookie = request.cookies.get("better-auth.session_token");
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
