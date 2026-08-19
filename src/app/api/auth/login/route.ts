import { NextResponse } from "next/server";
import { createSessionToken, isSameOriginPost, sessionConfig, verifyPassword } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

async function rateLimitKey(request: Request, secret: string): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const agent = request.headers.get("user-agent")?.slice(0, 180) ?? "unknown";
  const bytes = new TextEncoder().encode(`${secret}\n${address}\n${agent}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(key: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("check_login_rate_limit", { p_key_hash: key });
  if (error) return 0; // Older deployments remain usable until the new migration is applied.
  return Math.max(0, Number(data ?? 0));
}

async function recordAttempt(key: string, success: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.rpc("record_login_attempt", { p_key_hash: key, p_success: success });
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!sitePassword || !authSecret || authSecret.length < 32) {
    return NextResponse.json(
      { error: "사이트 비밀번호 설정이 완료되지 않았습니다. SITE_PASSWORD와 AUTH_SECRET을 확인하세요." },
      { status: 503 },
    );
  }

  const attemptKey = await rateLimitKey(request, authSecret);
  const retryAfter = await checkRateLimit(attemptKey);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `로그인 시도가 잠시 제한되었습니다. 약 ${Math.ceil(retryAfter / 60)}분 뒤 다시 시도하세요.` },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!password || password.length > 256 || !(await verifyPassword(password, sitePassword))) {
    await recordAttempt(attemptKey, false);
    await new Promise((resolve) => setTimeout(resolve, 650));
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  await recordAttempt(attemptKey, true);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: sessionConfig.cookieName,
    value: await createSessionToken(authSecret),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: sessionConfig.maxAge,
    priority: "high",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
