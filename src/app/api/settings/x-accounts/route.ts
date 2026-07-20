import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

function normalizeAccounts(values: unknown): string[] | null {
  if (!Array.isArray(values)) return null;
  const usernames = [...new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
  )];
  if (usernames.length > 10) return null;
  if (usernames.some((username) => !/^[a-z0-9_]{1,30}$/.test(username))) return null;
  return usernames;
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let values: unknown;
  try {
    const body = (await request.json()) as { usernames?: unknown };
    values = body.usernames;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const usernames = normalizeAccounts(values);
  if (!usernames) {
    return NextResponse.json({ error: "계정은 최대 10개이며 영문, 숫자, 밑줄만 사용할 수 있습니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  }

  const { error } = await supabase.rpc("replace_x_monitored_accounts", {
    p_usernames: usernames,
  });
  if (error) {
    const migrationMissing = error.message.includes("replace_x_monitored_accounts") || error.code === "PGRST202";
    const safeDeleteBlocked = error.message.includes("DELETE requires a WHERE clause");
    return NextResponse.json(
      {
        error: migrationMissing
          ? "Supabase에서 202607200004_split_x_settings.sql을 먼저 실행하세요."
          : safeDeleteBlocked
            ? "Supabase에서 202607200005_fix_x_account_replace.sql을 실행하세요."
            : `계정 저장 실패: ${error.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, usernames });
}
