import { NextResponse, type NextRequest } from "next/server";
import { sessionConfig, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/manifest.webmanifest"]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/.well-known/workflow/")) return NextResponse.next();
  // Vercel Cron은 브라우저 로그인 쿠키 없이 호출된다. 실제 인증은 Route Handler의 CRON_SECRET 검증에 맡긴다.
  if (path === "/api/cron/daily-refresh") return NextResponse.next();
  const authenticated = await verifySessionToken(
    request.cookies.get(sessionConfig.cookieName)?.value,
    process.env.AUTH_SECRET,
  );

  if (PUBLIC_PATHS.has(path)) {
    if (authenticated && path === "/login") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (authenticated) return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", path);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
