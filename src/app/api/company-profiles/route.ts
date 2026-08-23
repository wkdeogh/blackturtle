import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { isAuthenticated } from "@/lib/auth";
import { COMPANY_PROFILE_ESTIMATED_INPUT_TOKENS, COMPANY_PROFILE_PROMPT_VERSION } from "@/lib/company-profile-analysis";
import { DEFAULT_OPENAI_COMPANY_PROFILE_MODEL } from "@/lib/openai-config";
import { isSameOriginPost } from "@/lib/session";
import { getCompanyProfileDetail, getCompanyProfilesState, getSupabaseAdmin } from "@/lib/supabase";
import { companyProfileWorkflow, getCompanyProfileRefreshPreview } from "@/workflows/company-profiles";

function modelName() {
  return process.env.OPENAI_COMPANY_PROFILE_MODEL?.trim() || DEFAULT_OPENAI_COMPANY_PROFILE_MODEL;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase();
    let state = await getCompanyProfilesState();
    const run = state.latestRun;
    if (run?.status === "running" && run.workflowRunId && Date.now() - Date.parse(run.startedAt) > 15 * 60_000) {
      try {
        const workflowStatus = await getRun(run.workflowRunId).status;
        if (workflowStatus === "failed" || workflowStatus === "cancelled") {
          await getSupabaseAdmin()?.rpc("fail_company_profile_run", {
            p_run_id: run.id,
            p_error: workflowStatus === "cancelled" ? "지속 실행 기업 분석이 취소되었습니다." : "지속 실행 기업 분석이 복구되지 못하고 종료되었습니다.",
          });
          state = await getCompanyProfilesState();
        }
      } catch {
        // Supabase의 진행 상태를 유지하고 다음 조회에서 다시 확인한다.
      }
    }
    if (ticker) {
      const detail = await getCompanyProfileDetail(ticker);
      return NextResponse.json({ migrationReady: detail.migrationReady, profile: detail.profile, run: state.latestRun }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ migrationReady: state.migrationReady, summaries: state.summaries, run: state.latestRun }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "기업 정보를 조회하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  let action: "preview" | "start";
  let mode: "bulk" | "single";
  let ticker: string | undefined;
  let expectedCount: number | undefined;
  try {
    const body = (await request.json()) as { action?: unknown; mode?: unknown; ticker?: unknown; expectedCount?: unknown };
    if (body.action !== "preview" && body.action !== "start") throw new Error();
    if (body.mode !== "bulk" && body.mode !== "single") throw new Error();
    action = body.action;
    mode = body.mode;
    ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : undefined;
    expectedCount = typeof body.expectedCount === "number" && Number.isInteger(body.expectedCount) ? body.expectedCount : undefined;
    if (mode === "single" && (!ticker || !/^[A-Z][A-Z0-9./-]{0,14}$/.test(ticker))) throw new Error();
  } catch {
    return NextResponse.json({ error: "기업 정보 갱신 요청이 올바르지 않습니다." }, { status: 400 });
  }

  const missing = [
    !process.env.OPENAI_API_KEY && "OPENAI_API_KEY",
    !process.env.SEC_USER_AGENT && "SEC_USER_AGENT",
  ].filter(Boolean) as string[];
  if (missing.length) return NextResponse.json({ error: `설정되지 않은 환경 변수: ${missing.join(", ")}` }, { status: 503 });

  const model = modelName();
  let preview: Awaited<ReturnType<typeof getCompanyProfileRefreshPreview>>;
  try {
    preview = await getCompanyProfileRefreshPreview(mode === "single" ? ticker : undefined, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : "기업 분석 대상을 확인하지 못했습니다.";
    return NextResponse.json({
      error: message === "COMPANY_PROFILE_MIGRATION_REQUIRED"
        ? "Supabase에서 202608230015_company_profiles.sql을 먼저 실행하세요."
        : message,
    }, { status: message === "COMPANY_PROFILE_MIGRATION_REQUIRED" ? 503 : 400 });
  }

  const estimatedInputTokens = preview.candidates.length * COMPANY_PROFILE_ESTIMATED_INPUT_TOKENS;
  if (action === "preview") {
    return NextResponse.json({
      mode,
      ticker: ticker ?? null,
      model,
      promptVersion: COMPANY_PROFILE_PROMPT_VERSION,
      totalCompanies: preview.universe.length,
      candidateCount: preview.candidates.length,
      skippedCount: preview.skippedCount,
      newCount: preview.newCount,
      staleCount: preview.staleCount,
      estimatedInputTokens,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!preview.candidates.length) return NextResponse.json({ error: "60일 이내에 분석된 최신 기업 정보입니다." }, { status: 400 });
  if (expectedCount !== undefined && expectedCount !== preview.candidates.length) {
    return NextResponse.json({ error: "확인 후 분석 대상이 변경됐습니다. 다시 전체 갱신 버튼을 눌러 확인하세요." }, { status: 409 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  const { data: runId, error: startError } = await supabase.rpc("start_company_profile_run", {
    p_mode: mode,
    p_ticker: ticker ?? null,
    p_model: model,
    p_prompt_version: COMPANY_PROFILE_PROMPT_VERSION,
    p_total_count: preview.candidates.length,
    p_skipped_count: preview.skippedCount,
    p_estimated_input_tokens: estimatedInputTokens,
  });
  if (startError || !runId) {
    const busy = startError?.message.includes("COMPANY_PROFILE_ALREADY_RUNNING");
    const migrationMissing = startError?.code === "PGRST202" || startError?.message.includes("start_company_profile_run");
    return NextResponse.json({
      error: migrationMissing ? "Supabase에서 202608230015_company_profiles.sql을 먼저 실행하세요." : busy ? "이미 기업 정보 갱신이 진행 중입니다." : `기업 정보 갱신 시작 실패: ${startError?.message ?? "실행 ID 없음"}`,
    }, { status: busy ? 409 : 500 });
  }

  try {
    const tickers = preview.candidates.map((company) => company.symbol);
    const workflowRun = await start(companyProfileWorkflow, [runId as string, tickers, model, mode]);
    const attach = await supabase.rpc("attach_company_profile_workflow", { p_run_id: runId, p_workflow_run_id: workflowRun.runId });
    if (attach.error) throw new Error(`기업 분석 Workflow 연결 실패: ${attach.error.message}`);
    const state = await getCompanyProfilesState();
    return NextResponse.json({ ok: true, run: state.latestRun }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_500) : "기업 분석 Workflow 시작에 실패했습니다.";
    await supabase.rpc("fail_company_profile_run", { p_run_id: runId, p_error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
