import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

async function adminGuard(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return adminGuard(request);

  // Español va sin prefijo: /es/... redirige a la URL limpia y el resto se reescribe a /es internamente.
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  const headers = new Headers(request.headers);
  const prefixed = /^\/(en|pt)(\/|$)/.exec(pathname);
  headers.set("x-locale", prefixed ? prefixed[1] : "es");
  if (prefixed) return NextResponse.next({ request: { headers } });

  const url = request.nextUrl.clone();
  url.pathname = `/es${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/((?!api|admin|uploads|media|_next|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
