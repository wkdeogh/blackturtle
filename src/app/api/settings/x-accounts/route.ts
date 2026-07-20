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
  if (usernames.length < 1 || usernames.length > 10) return null;
  if (usernames.some((username) => !/^[a-z0-9_]{1,30}$/.test(username))) return null;
  return usernames;
}

function normalizeLookbackDays(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30 ? value : null;
}

function normalizeOptionalLimit(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : "invalid";
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let values: unknown;
  let lookbackValue: unknown;
  let perAccountLimitValue: unknown;
  let totalLimitValue: unknown;
  try {
    const body = (await request.json()) as {
      usernames?: unknown;
      lookbackDays?: unknown;
      perAccountPostLimit?: unknown;
      totalPostLimit?: unknown;
    };
    values = body.usernames;
    lookbackValue = body.lookbackDays;
    perAccountLimitValue = body.perAccountPostLimit;
    totalLimitValue = body.totalPostLimit;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const usernames = normalizeAccounts(values);
  const lookbackDays = normalizeLookbackDays(lookbackValue);
  const perAccountPostLimit = normalizeOptionalLimit(perAccountLimitValue);
  const totalPostLimit = normalizeOptionalLimit(totalLimitValue);
  if (!usernames || !lookbackDays || perAccountPostLimit === "invalid" || totalPostLimit === "invalid") {
    return NextResponse.json({ error: "계정, 수집 기간과 게시물 상한 값을 확인하세요. 상한은 비워두거나 1 이상의 정수를 입력해야 합니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  }

  const { error } = await supabase.rpc("replace_x_monitor_settings", {
    p_usernames: usernames,
    p_lookback_days: lookbackDays,
    p_per_account_post_limit: perAccountPostLimit,
    p_total_post_limit: totalPostLimit,
  });
  if (error) {
    const migrationMissing = error.message.includes("replace_x_monitor_settings") || error.code === "PGRST202";
    return NextResponse.json(
      { error: migrationMissing ? "Supabase에서 202607200003_x_monitored_accounts.sql을 먼저 실행하세요." : `계정 저장 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, usernames, lookbackDays, perAccountPostLimit, totalPostLimit });
}
