import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost, sessionConfig } from "@/lib/session";

export async function POST(request: Request) {
  if (!isSameOriginPost(request) || !(await isAuthenticated())) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: sessionConfig.cookieName,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
