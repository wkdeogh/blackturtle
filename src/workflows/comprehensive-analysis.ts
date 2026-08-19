import { analyzeDashboardWithOpenAI, buildComprehensiveAnalysisInput, estimateAnalysisInputTokens } from "@/lib/comprehensive-analysis";
import { resolveOpenAIComprehensiveModel } from "@/lib/openai-config";
import { refreshErrorMessage } from "@/lib/refresh-runner";
import { getInvestorResearchState, getLatestSnapshot, getPortfolioItems, getSnapshotById, getSupabaseAdmin } from "@/lib/supabase";
import type { ComprehensiveAnalysisReport } from "@/lib/types";
import { start } from "workflow/api";

async function analyzeAndStore(runId: string, snapshotId: string, requestedModel: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("설정되지 않은 환경 변수: OPENAI_API_KEY");

  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot) throw new Error("분석할 대시보드 스냅샷을 찾지 못했습니다.");
  const model = resolveOpenAIComprehensiveModel(requestedModel || process.env.OPENAI_COMPREHENSIVE_MODEL);
  const [research, portfolio] = await Promise.all([getInvestorResearchState(), getPortfolioItems()]);
  const estimatedInputTokens = estimateAnalysisInputTokens(buildComprehensiveAnalysisInput(snapshot.payload, research, portfolio.items));

  const stageResult = await supabase.rpc("set_comprehensive_analysis_stage", { p_run_id: runId, p_stage: "analyzing" });
  if (stageResult.error) throw new Error(`종합분석 상태 저장 실패: ${stageResult.error.message}`);

  const generated = await analyzeDashboardWithOpenAI(snapshot.payload, apiKey, model, research, portfolio.items);
  const report: ComprehensiveAnalysisReport = {
    version: 2,
    generatedAt: new Date().toISOString(),
    sourceSnapshotId: snapshot.id,
    sourceSnapshotGeneratedAt: snapshot.payload.generatedAt,
    model,
    estimatedInputTokens,
    ...generated,
  };

  const savingResult = await supabase.rpc("set_comprehensive_analysis_stage", { p_run_id: runId, p_stage: "saving" });
  if (savingResult.error) throw new Error(`종합분석 저장 상태 갱신 실패: ${savingResult.error.message}`);
  const completeResult = await supabase.rpc("complete_comprehensive_analysis", { p_run_id: runId, p_report: report });
  if (completeResult.error) throw new Error(`종합분석 리포트 저장 실패: ${completeResult.error.message}`);
  return report.generatedAt;
}

// 유료 고급 모델 호출은 응답 유실 시에도 과금됐을 수 있으므로 자동 재호출하지 않는다.
analyzeAndStore.maxRetries = 0;

async function failRun(runId: string, message: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.rpc("fail_comprehensive_analysis", { p_run_id: runId, p_error: message });
}

export async function queueLatestComprehensiveAnalysis(requestedModel: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  if (!process.env.OPENAI_API_KEY) throw new Error("설정되지 않은 환경 변수: OPENAI_API_KEY");

  const snapshot = await getLatestSnapshot();
  if (!snapshot) throw new Error("종합분석에 사용할 최신 스냅샷을 찾지 못했습니다.");
  const hasData = snapshot.payload.macro.length || snapshot.payload.market?.series.length || snapshot.payload.social.posts.length;
  if (!hasData) throw new Error("종합분석할 저장 데이터가 없습니다.");

  const model = resolveOpenAIComprehensiveModel(requestedModel || process.env.OPENAI_COMPREHENSIVE_MODEL);
  const [research, portfolio] = await Promise.all([getInvestorResearchState(), getPortfolioItems()]);
  const estimatedInputTokens = estimateAnalysisInputTokens(buildComprehensiveAnalysisInput(snapshot.payload, research, portfolio.items));
  const { data: runId, error: startError } = await supabase.rpc("start_comprehensive_analysis", {
    p_snapshot_id: snapshot.id,
    p_model: model,
    p_estimated_input_tokens: estimatedInputTokens,
  });
  if (startError || !runId) throw new Error(`종합분석 시작 실패: ${startError?.message ?? "실행 ID를 받지 못했습니다."}`);

  try {
    const workflowRun = await start(comprehensiveAnalysisWorkflow, [runId as string, snapshot.id, model]);
    const attachResult = await supabase.rpc("attach_comprehensive_analysis_workflow", {
      p_run_id: runId,
      p_workflow_run_id: workflowRun.runId,
    });
    if (attachResult.error) throw new Error(`종합분석 Workflow 연결 실패: ${attachResult.error.message}`);
    return { runId: runId as string, workflowRunId: workflowRun.runId };
  } catch (error) {
    await supabase.rpc("fail_comprehensive_analysis", {
      p_run_id: runId,
      p_error: refreshErrorMessage(error),
    });
    throw error;
  }
}

// 유료 분석 Workflow 등록을 자동 반복하면 중복 과금 가능성이 있으므로 재시도하지 않는다.
queueLatestComprehensiveAnalysis.maxRetries = 0;

export async function comprehensiveAnalysisWorkflow(runId: string, snapshotId: string, model: string) {
  "use workflow";
  try {
    const generatedAt = await analyzeAndStore(runId, snapshotId, model);
    return { ok: true, generatedAt };
  } catch (error) {
    const message = refreshErrorMessage(error);
    await failRun(runId, message);
    return { ok: false, error: message };
  }
}
