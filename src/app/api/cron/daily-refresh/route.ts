import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { getLatestRefreshRun, getMissingConfiguration, getSupabaseAdmin } from "@/lib/supabase";
import { refreshDataWorkflow } from "@/workflows/refresh-data";

const AUTOMATIC_TARGETS = ["macro", "market"] as const;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Vercel Cron: 매일 07:00 KST에 매크로와 시장지수 저장 데이터만 갱신한다. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const missing = [...new Set(AUTOMATIC_TARGETS.flatMap((target) => getMissingConfiguration(target)))];
  if (missing.length) {
    return NextResponse.json({ error: `설정되지 않은 환경 변수: ${missing.join(", ")}` }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });

  const { data: runId, error: startError } = await supabase.rpc("start_refresh_job", { p_source: "all" });
  if (startError) {
    if (startError.message.includes("REFRESH_ALREADY_RUNNING")) {
      const run = await getLatestRefreshRun();
      return NextResponse.json({ ok: true, skipped: true, reason: "이미 갱신이 진행 중입니다.", run });
    }
    const migrationMissing = startError.message.includes("start_refresh_job") || startError.code === "PGRST202";
    const fullMigrationMissing = startError.message.includes("REFRESH_SOURCE_INVALID");
    return NextResponse.json(
      { error: fullMigrationMissing ? "Supabase에서 202607250012_full_refresh.sql을 먼저 실행하세요." : migrationMissing ? "Supabase에서 202607200007_durable_refresh.sql을 먼저 실행하세요." : `갱신 시작 실패: ${startError.message}` },
      { status: 500 },
    );
  }

  try {
    const workflowRun = await start(refreshDataWorkflow, [runId as string, "all", "collect_and_analyze", [...AUTOMATIC_TARGETS], undefined, "all"]);
    const { error: attachError } = await supabase.rpc("attach_refresh_workflow", { p_run_id: runId, p_workflow_run_id: workflowRun.runId });
    if (attachError) throw new Error(`Workflow 연결 실패: ${attachError.message}`);
    return NextResponse.json({ ok: true, runId, workflowRunId: workflowRun.runId }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 600) : "Workflow 시작에 실패했습니다.";
    await supabase.rpc("fail_refresh", { p_run_id: runId, p_error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
