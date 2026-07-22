import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getLatestRefreshRun, getMissingConfiguration, getSupabaseAdmin } from "@/lib/supabase";
import type { RefreshSource, SocialRefreshMode } from "@/lib/types";
import { normalizeXCollectionSettings } from "@/lib/x-collection-settings";
import { refreshDataWorkflow } from "@/workflows/refresh-data";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    let run = await getLatestRefreshRun();
    if (run?.status === "running" && run.workflowRunId && Date.now() - new Date(run.startedAt).getTime() > 15 * 60 * 1000) {
      try {
        const workflowStatus = await getRun(run.workflowRunId).status;
        if (workflowStatus === "failed" || workflowStatus === "cancelled") {
          const supabase = getSupabaseAdmin();
          await supabase?.rpc("fail_refresh", {
            p_run_id: run.id,
            p_error: workflowStatus === "cancelled" ? "지속 실행 작업이 취소되었습니다." : "지속 실행 작업이 복구되지 못하고 종료되었습니다.",
          });
          run = await getLatestRefreshRun();
        }
      } catch {
        // Supabase status remains authoritative while Workflow status is temporarily unavailable.
      }
    }
    return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "갱신 상태를 조회하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  let source: RefreshSource;
  let socialMode: SocialRefreshMode = "collect_and_analyze";
  let collectionSettings: ReturnType<typeof normalizeXCollectionSettings> = null;
  try {
    const body = (await request.json()) as { source?: unknown; socialMode?: unknown; collectionSettings?: unknown };
    if (body.source !== "macro" && body.source !== "social") throw new Error();
    source = body.source;
    if (source === "social") {
      if (body.socialMode !== undefined && body.socialMode !== "collect_and_analyze" && body.socialMode !== "collect_only" && body.socialMode !== "analyze_only") throw new Error();
      socialMode = (body.socialMode as SocialRefreshMode | undefined) ?? "collect_and_analyze";
    }
    if (source === "social" && socialMode !== "analyze_only" && body.collectionSettings !== undefined) {
      collectionSettings = normalizeXCollectionSettings(body.collectionSettings);
      if (!collectionSettings) {
        return NextResponse.json({ error: "수집 기간과 게시물 상한을 확인하세요. 상한은 비우거나 1 이상의 정수를 입력해야 합니다." }, { status: 400 });
      }
    }
  } catch {
    return NextResponse.json({ error: "갱신 대상이 올바르지 않습니다." }, { status: 400 });
  }

  const missing = getMissingConfiguration(source, socialMode);
  if (missing.length) {
    return NextResponse.json({ error: `설정되지 않은 환경 변수: ${missing.join(", ")}` }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const { data: runId, error: startError } = await supabase.rpc("start_refresh_job", { p_source: source });
  if (startError) {
    const busy = startError.message.includes("REFRESH_ALREADY_RUNNING");
    const migrationMissing = startError.message.includes("start_refresh_job") || startError.code === "PGRST202";
    return NextResponse.json(
      { error: migrationMissing ? "Supabase에서 202607200007_durable_refresh.sql을 먼저 실행하세요." : busy ? "이미 데이터 갱신이 진행 중입니다." : `갱신 시작 실패: ${startError.message}` },
      { status: busy ? 409 : 500 },
    );
  }

  try {
    if (collectionSettings) {
      const { error } = await supabase.rpc("update_x_collection_settings", {
        p_lookback_days: collectionSettings.lookbackDays,
        p_per_account_post_limit: collectionSettings.perAccountPostLimit,
        p_total_post_limit: collectionSettings.totalPostLimit,
      });
      if (error) throw new Error(`수집 설정 저장 실패: ${error.message}`);
    }

    const workflowRun = await start(refreshDataWorkflow, [runId as string, source, socialMode]);
    await supabase.rpc("attach_refresh_workflow", { p_run_id: runId, p_workflow_run_id: workflowRun.runId });
    const run = await getLatestRefreshRun();
    return NextResponse.json({ ok: true, run }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 600) : "Workflow 시작에 실패했습니다.";
    await supabase.rpc("fail_refresh", { p_run_id: runId, p_error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
