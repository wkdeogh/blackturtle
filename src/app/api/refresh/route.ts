import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { collectFredData } from "@/lib/fred";
import { isSameOriginPost } from "@/lib/session";
import { getLatestSnapshot, getMissingConfiguration, getSupabaseAdmin, getXMonitorSettings } from "@/lib/supabase";
import type { DashboardSnapshot, RefreshSource } from "@/lib/types";
import { collectXData } from "@/lib/x-api";

export const maxDuration = 300;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 600);
  return "알 수 없는 갱신 오류가 발생했습니다.";
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let source: RefreshSource;
  try {
    const body = (await request.json()) as { source?: unknown };
    if (body.source !== "macro" && body.source !== "social") throw new Error();
    source = body.source;
  } catch {
    return NextResponse.json({ error: "갱신 대상이 올바르지 않습니다." }, { status: 400 });
  }

  const missing = getMissingConfiguration(source);
  if (missing.length) {
    return NextResponse.json({ error: `설정되지 않은 환경 변수: ${missing.join(", ")}` }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const { data: runId, error: startError } = await supabase.rpc("start_refresh");
  if (startError) {
    const busy = startError.message.includes("REFRESH_ALREADY_RUNNING");
    return NextResponse.json(
      { error: busy ? "이미 데이터 갱신이 진행 중입니다." : `갱신 시작 실패: ${startError.message}` },
      { status: busy ? 409 : 500 },
    );
  }

  try {
    const previous = await getLatestSnapshot();
    const now = new Date().toISOString();
    let macro = previous?.payload.macro ?? [];
    let social = previous?.payload.social ?? {
      periodDays: 7,
      accounts: [],
      posts: [],
      companies: [],
      analyzedPostCount: 0,
    };

    if (source === "macro") {
      macro = await collectFredData(process.env.FRED_API_KEY!);
    } else {
      const { usernames, lookbackDays, perAccountPostLimit, totalPostLimit } = await getXMonitorSettings();
      if (!usernames.length) throw new Error("계정 설정에서 모니터링할 X 계정을 한 개 이상 저장하세요.");
      social = await collectXData(
        process.env.X_BEARER_TOKEN!,
        usernames,
        lookbackDays,
        perAccountPostLimit,
        totalPostLimit,
        process.env.OPENAI_API_KEY!,
        process.env.OPENAI_MODEL ?? "gpt-5-nano",
        previous?.payload.social,
      );
    }

    const snapshot: DashboardSnapshot = {
      version: 1,
      generatedAt: now,
      macroUpdatedAt: source === "macro" ? now : previous?.payload.macroUpdatedAt ?? previous?.payload.generatedAt,
      socialUpdatedAt: source === "social" ? now : previous?.payload.socialUpdatedAt ?? previous?.payload.generatedAt,
      macro,
      social,
    };

    const { error: completeError } = await supabase.rpc("complete_refresh", {
      p_run_id: runId,
      p_payload: snapshot,
    });
    if (completeError) throw new Error(`스냅샷 저장 실패: ${completeError.message}`);

    return NextResponse.json({ ok: true, source, generatedAt: snapshot.generatedAt });
  } catch (error) {
    const message = errorMessage(error);
    await supabase.rpc("fail_refresh", { p_run_id: runId, p_error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
