import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "bd_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page and its API route through unconditionally.
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD;
  const auth = request.cookies.get(COOKIE)?.value;

  if (password && auth === password) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
