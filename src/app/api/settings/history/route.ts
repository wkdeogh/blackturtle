import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  let retentionLimit: unknown;
  try {
    const body = (await request.json()) as { retentionLimit?: unknown };
    retentionLimit = body.retentionLimit;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof retentionLimit !== "number" || !Number.isInteger(retentionLimit) || retentionLimit < 5 || retentionLimit > 100) {
    return NextResponse.json({ error: "보관 개수는 5~100 사이의 정수로 입력하세요." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });

  const { error } = await supabase.rpc("update_history_retention_limit", { p_limit: retentionLimit });
  if (error) {
    const migrationMissing = error.message.includes("update_history_retention_limit") || error.code === "PGRST202";
    return NextResponse.json(
      { error: migrationMissing ? "Supabase에서 202607200006_snapshot_history.sql을 먼저 실행하세요." : `히스토리 설정 저장 실패: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, retentionLimit });
}
