import { NextResponse } from "next/server";
import { createSessionToken, isSameOriginPost, sessionConfig, verifyPassword } from "@/lib/session";

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

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!password || password.length > 256 || !(await verifyPassword(password, sitePassword))) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

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
