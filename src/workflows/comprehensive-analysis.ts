import { analyzeDashboardWithOpenAI, buildComprehensiveAnalysisInput, estimateAnalysisInputTokens } from "@/lib/comprehensive-analysis";
import { DEFAULT_OPENAI_COMPREHENSIVE_MODEL } from "@/lib/openai-config";
import { refreshErrorMessage } from "@/lib/refresh-runner";
import { getSnapshotById, getSupabaseAdmin } from "@/lib/supabase";
import type { ComprehensiveAnalysisReport } from "@/lib/types";

async function analyzeAndStore(runId: string, snapshotId: string, requestedModel: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("설정되지 않은 환경 변수: OPENAI_API_KEY");

  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot) throw new Error("분석할 대시보드 스냅샷을 찾지 못했습니다.");
  const model = requestedModel || process.env.OPENAI_COMPREHENSIVE_MODEL || DEFAULT_OPENAI_COMPREHENSIVE_MODEL;
  const estimatedInputTokens = estimateAnalysisInputTokens(buildComprehensiveAnalysisInput(snapshot.payload));

  const stageResult = await supabase.rpc("set_comprehensive_analysis_stage", { p_run_id: runId, p_stage: "analyzing" });
  if (stageResult.error) throw new Error(`종합분석 상태 저장 실패: ${stageResult.error.message}`);

  const generated = await analyzeDashboardWithOpenAI(snapshot.payload, apiKey, model);
  const report: ComprehensiveAnalysisReport = {
    version: 1,
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
