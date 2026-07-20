import { collectRefreshSnapshot, refreshErrorMessage } from "@/lib/refresh-runner";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RefreshSource } from "@/lib/types";

async function setRefreshStage(runId: string, stage: "collecting" | "saving") {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { error } = await supabase.rpc("set_refresh_stage", { p_run_id: runId, p_stage: stage });
  if (error) throw new Error(`갱신 상태 저장 실패: ${error.message}`);
}

async function collectAndStoreDraft(runId: string, source: RefreshSource) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");

  const snapshot = await collectRefreshSnapshot(source);
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`수집 결과 임시 저장 실패: ${error.message}`);
  return snapshot.generatedAt;
}

// X와 OpenAI는 유료 호출이므로 실패 시 Workflow가 자동으로 중복 호출하지 않는다.
collectAndStoreDraft.maxRetries = 0;

async function publishRefresh(runId: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { error } = await supabase.rpc("complete_refresh_from_draft", { p_run_id: runId });
  if (error) throw new Error(`스냅샷 저장 실패: ${error.message}`);
}

async function recoverDraftOrFail(runId: string, message: string): Promise<boolean> {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { data, error } = await supabase.rpc("recover_refresh_draft_or_fail", { p_run_id: runId, p_error: message });
  if (error) throw new Error(`갱신 복구 상태 저장 오류: ${error.message}`);
  return Boolean(data);
}

export async function refreshDataWorkflow(runId: string, source: RefreshSource) {
  "use workflow";
  let stage = "갱신 준비";
  try {
    await setRefreshStage(runId, "collecting");
    stage = source === "macro" ? "FRED 수집" : "X/OpenAI 수집";
    const generatedAt = await collectAndStoreDraft(runId, source);
    stage = "스냅샷 저장";
    await publishRefresh(runId);
    return { ok: true, generatedAt };
  } catch (error) {
    const message = `${stage}: ${refreshErrorMessage(error)}`;
    const recovered = await recoverDraftOrFail(runId, message);
    return recovered ? { ok: true, recovered: true } : { ok: false, error: message };
  }
}
