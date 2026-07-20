import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeXCollectionSettings } from "@/lib/x-collection-settings";

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const settings = normalizeXCollectionSettings(body);
  if (!settings) {
    return NextResponse.json({ error: "수집 기간과 게시물 상한을 확인하세요. 상한은 비우거나 1 이상의 정수를 입력해야 합니다." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });

  const { error } = await supabase.rpc("update_x_collection_settings", {
    p_lookback_days: settings.lookbackDays,
    p_per_account_post_limit: settings.perAccountPostLimit,
    p_total_post_limit: settings.totalPostLimit,
  });
  if (error) {
    const migrationMissing = error.message.includes("update_x_collection_settings") || error.code === "PGRST202";
    return NextResponse.json(
      { error: migrationMissing ? "Supabase에서 202607200004_split_x_settings.sql을 먼저 실행하세요." : `수집 설정 저장 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...settings });
}
