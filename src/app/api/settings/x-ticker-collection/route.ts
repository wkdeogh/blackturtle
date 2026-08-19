import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

function optionalPositiveInteger(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : "invalid";
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  let lookbackDays = 0;
  let perTickerPostLimit: number | null | "invalid" = "invalid";
  let totalPostLimit: number | null | "invalid" = "invalid";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    lookbackDays = typeof body.lookbackDays === "number" ? body.lookbackDays : 0;
    perTickerPostLimit = optionalPositiveInteger(body.perTickerPostLimit);
    totalPostLimit = optionalPositiveInteger(body.totalPostLimit);
  } catch {
    // Normalized validation response below.
  }
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 7 || perTickerPostLimit === "invalid" || totalPostLimit === "invalid") {
    return NextResponse.json({ error: "티커 검색 기간은 1~7일, 게시물 상한은 비우거나 1 이상의 정수로 입력하세요." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  const { error } = await supabase.rpc("update_x_ticker_collection_settings", {
    p_lookback_days: lookbackDays,
    p_per_ticker_post_limit: perTickerPostLimit,
    p_total_post_limit: totalPostLimit,
  });
  if (error) {
    const missing = error.message.includes("update_x_ticker_collection_settings") || error.code === "PGRST202";
    return NextResponse.json({ error: missing ? "Supabase에서 202608190013_x_ticker_monitoring.sql을 먼저 실행하세요." : `티커 수집 설정 저장 실패: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
