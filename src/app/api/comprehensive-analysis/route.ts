import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { isAuthenticated } from "@/lib/auth";
import { buildComprehensiveAnalysisInput, buildManualComprehensiveAnalysisPrompt, COMPREHENSIVE_MAX_OUTPUT_TOKENS, estimateAnalysisInputTokens, estimateManualAnalysisPromptTokens, parseManualComprehensiveAnalysisResult } from "@/lib/comprehensive-analysis";
import { isOpenAIComprehensiveModel, resolveOpenAIComprehensiveModel } from "@/lib/openai-config";
import { isSameOriginPost } from "@/lib/session";
import { getComprehensiveAnalysisState, getLatestSnapshot, getSnapshotById, getSupabaseAdmin } from "@/lib/supabase";
import type { ComprehensiveAnalysisReport } from "@/lib/types";
import { comprehensiveAnalysisWorkflow } from "@/workflows/comprehensive-analysis";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    let state = await getComprehensiveAnalysisState();
    const run = state.latestRun;
    if (run?.status === "running" && run.workflowRunId && Date.now() - new Date(run.startedAt).getTime() > 15 * 60 * 1000) {
      try {
        const workflowStatus = await getRun(run.workflowRunId).status;
        if (workflowStatus === "failed" || workflowStatus === "cancelled") {
          await getSupabaseAdmin()?.rpc("fail_comprehensive_analysis", {
            p_run_id: run.id,
            p_error: workflowStatus === "cancelled" ? "지속 실행 분석이 취소되었습니다." : "지속 실행 분석이 복구되지 못하고 종료되었습니다.",
          });
          state = await getComprehensiveAnalysisState();
        }
      } catch {
        // Supabase status remains authoritative while Workflow status is temporarily unavailable.
      }
    }
    return NextResponse.json({ run: state.latestRun }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "종합분석 상태를 조회하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  let action: "preview" | "start" | "manual-prompt" | "manual-import";
  let requestedSnapshotId: string | undefined;
  let requestedModel: unknown;
  let manualResult = "";
  let manualSourceModel = "";
  try {
    const body = (await request.json()) as { action?: unknown; snapshotId?: unknown; model?: unknown; result?: unknown; sourceModel?: unknown };
    if (body.action !== "preview" && body.action !== "start" && body.action !== "manual-prompt" && body.action !== "manual-import") throw new Error();
    action = body.action;
    requestedSnapshotId = typeof body.snapshotId === "string" ? body.snapshotId : undefined;
    requestedModel = body.model;
    manualResult = typeof body.result === "string" ? body.result : "";
    manualSourceModel = typeof body.sourceModel === "string" ? body.sourceModel.trim().replace(/\s+/g, " ").slice(0, 70) : "";
  } catch {
    return NextResponse.json({ error: "종합분석 요청이 올바르지 않습니다." }, { status: 400 });
  }

  if ((action === "preview" || action === "start") && requestedModel !== undefined && !isOpenAIComprehensiveModel(requestedModel)) {
    return NextResponse.json({ error: "지원하지 않는 종합분석 모델입니다." }, { status: 400 });
  }

  if (action === "manual-import") {
    let parsed: ReturnType<typeof parseManualComprehensiveAnalysisResult>;
    try { parsed = parseManualComprehensiveAnalysisResult(manualResult); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "붙여넣은 결과를 읽지 못했습니다." }, { status: 400 }); }

    const sourceSnapshot = await getSnapshotById(parsed.snapshotId);
    if (!sourceSnapshot) return NextResponse.json({ error: "이 결과가 참조하는 저장 데이터를 찾지 못했습니다. 프롬프트를 다시 복사해 분석하세요." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
    const estimatedInputTokens = estimateManualAnalysisPromptTokens(buildManualComprehensiveAnalysisPrompt(sourceSnapshot.payload, sourceSnapshot.id));
    const model = `직접 입력 · ${manualSourceModel || "외부 AI"}`;
    const { data: runId, error: startError } = await supabase.rpc("start_comprehensive_analysis", {
      p_snapshot_id: sourceSnapshot.id,
      p_model: model,
      p_estimated_input_tokens: estimatedInputTokens,
    });
    if (startError) {
      const busy = startError.message.includes("ANALYSIS_ALREADY_RUNNING");
      const migrationMissing = startError.message.includes("start_comprehensive_analysis") || startError.code === "PGRST202";
      return NextResponse.json({ error: migrationMissing ? "Supabase에서 202607220011_comprehensive_analysis.sql을 먼저 실행하세요." : busy ? "이미 종합분석이 진행 중입니다." : `수동 분석 저장 시작 실패: ${startError.message}` }, { status: busy ? 409 : 500 });
    }

    const report: ComprehensiveAnalysisReport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceSnapshotId: sourceSnapshot.id,
      sourceSnapshotGeneratedAt: sourceSnapshot.payload.generatedAt,
      model,
      estimatedInputTokens,
      ...parsed.report,
    };
    const completeResult = await supabase.rpc("complete_comprehensive_analysis", { p_run_id: runId, p_report: report });
    if (completeResult.error) {
      await supabase.rpc("fail_comprehensive_analysis", { p_run_id: runId, p_error: completeResult.error.message });
      return NextResponse.json({ error: `수동 분석 결과 저장 실패: ${completeResult.error.message}` }, { status: 500 });
    }
    const state = await getComprehensiveAnalysisState();
    return NextResponse.json({ ok: true, run: state.latestRun }, { status: 201 });
  }

  const snapshot = await getLatestSnapshot();
  if (!snapshot) return NextResponse.json({ error: "분석할 저장 데이터가 없습니다. 먼저 대시보드 데이터를 갱신하세요." }, { status: 400 });
  const hasData = snapshot.payload.macro.length || snapshot.payload.market?.series.length || snapshot.payload.social.posts.length;
  if (!hasData) return NextResponse.json({ error: "분석할 매크로·시장지수·모니터링 데이터가 없습니다." }, { status: 400 });

  const input = buildComprehensiveAnalysisInput(snapshot.payload);
  const estimatedInputTokens = estimateAnalysisInputTokens(input);
  if (action === "manual-prompt") {
    const prompt = buildManualComprehensiveAnalysisPrompt(snapshot.payload, snapshot.id);
    return NextResponse.json({
      snapshotId: snapshot.id,
      prompt,
      estimatedInputTokens: estimateManualAnalysisPromptTokens(prompt),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "설정되지 않은 환경 변수: OPENAI_API_KEY" }, { status: 503 });
  const model = isOpenAIComprehensiveModel(requestedModel) ? requestedModel : resolveOpenAIComprehensiveModel(process.env.OPENAI_COMPREHENSIVE_MODEL);
  if (action === "preview") {
    return NextResponse.json({
      snapshotId: snapshot.id,
      model,
      estimatedInputTokens,
      maxOutputTokens: COMPREHENSIVE_MAX_OUTPUT_TOKENS,
      dataCounts: {
        macro: snapshot.payload.macro.length,
        market: (snapshot.payload.market?.series.length ?? 0) + (snapshot.payload.market?.countryEtfs.length ?? 0),
        posts: snapshot.payload.social.posts.length,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!requestedSnapshotId || requestedSnapshotId !== snapshot.id) {
    return NextResponse.json({ error: "토큰 확인 후 데이터가 변경됐습니다. 다시 분석 버튼을 눌러 확인하세요." }, { status: 409 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });

  const { data: runId, error: startError } = await supabase.rpc("start_comprehensive_analysis", {
    p_snapshot_id: snapshot.id,
    p_model: model,
    p_estimated_input_tokens: estimatedInputTokens,
  });
  if (startError) {
    const busy = startError.message.includes("ANALYSIS_ALREADY_RUNNING");
    const migrationMissing = startError.message.includes("start_comprehensive_analysis") || startError.code === "PGRST202";
    return NextResponse.json({
      error: migrationMissing ? "Supabase에서 202607220011_comprehensive_analysis.sql을 먼저 실행하세요." : busy ? "이미 종합분석이 진행 중입니다." : `종합분석 시작 실패: ${startError.message}`,
    }, { status: busy ? 409 : 500 });
  }

  try {
    const workflowRun = await start(comprehensiveAnalysisWorkflow, [runId as string, snapshot.id, model]);
    await supabase.rpc("attach_comprehensive_analysis_workflow", { p_run_id: runId, p_workflow_run_id: workflowRun.runId });
    const state = await getComprehensiveAnalysisState();
    return NextResponse.json({ ok: true, run: state.latestRun }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "종합분석 Workflow 시작에 실패했습니다.";
    await supabase.rpc("fail_comprehensive_analysis", { p_run_id: runId, p_error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
