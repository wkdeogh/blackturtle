import { collectRefreshSnapshot, refreshErrorMessage } from "@/lib/refresh-runner";
import { analyzePostBatchWithOpenAI, OPENAI_BATCH_SIZE, type PostAnalysisResult } from "@/lib/social-analysis";
import { getLatestSnapshot, getMissingConfiguration, getSupabaseAdmin, getXMonitorSettings } from "@/lib/supabase";
import { analyzeTopicsWithOpenAI } from "@/lib/topic-analysis";
import type { DashboardSnapshot, MacroSeries, RefreshSource, SocialRefreshMode, TopicSummary } from "@/lib/types";
import { finalizeXCollection, finalizeXCollectionWithoutAnalysis, prepareXCollection, type PreparedXCollection, type RawSocialPost } from "@/lib/x-api";

interface SocialWorkflowContext {
  generatedAt: string;
  macro: MacroSeries[];
  macroUpdatedAt?: string;
  socialCollectedAt?: string;
  socialAnalyzedAt?: string;
  previousSocial?: DashboardSnapshot["social"];
  prepared: PreparedXCollection;
}

interface TopicStepResult {
  model: string;
  topics: TopicSummary[];
  error?: string;
}

async function setRefreshStage(runId: string, stage: "collecting" | "saving") {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { error } = await supabase.rpc("set_refresh_stage", { p_run_id: runId, p_stage: stage });
  if (error) throw new Error(`갱신 상태 저장 실패: ${error.message}`);
}

async function collectMacroAndStoreDraft(runId: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");

  const snapshot = await collectRefreshSnapshot("macro");
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`수집 결과 임시 저장 실패: ${error.message}`);
  return snapshot.generatedAt;
}

async function collectSocialPosts(): Promise<SocialWorkflowContext> {
  "use step";
  const missing = getMissingConfiguration("social", "collect_only");
  if (missing.length) throw new Error(`설정되지 않은 환경 변수: ${missing.join(", ")}`);

  const previous = await getLatestSnapshot();
  const { usernames, lookbackDays, perAccountPostLimit, totalPostLimit } = await getXMonitorSettings();
  if (!usernames.length) throw new Error("계정 설정에서 모니터링할 X 계정을 한 개 이상 저장하세요.");

  const analysisModel = process.env.OPENAI_MODEL ?? "gpt-5-nano";
  const prepared = await prepareXCollection(
    process.env.X_BEARER_TOKEN!,
    usernames,
    lookbackDays,
    perAccountPostLimit,
    totalPostLimit,
    analysisModel,
    previous?.payload.social,
  );
  return {
    generatedAt: new Date().toISOString(),
    macro: previous?.payload.macro ?? [],
    macroUpdatedAt: previous?.payload.macroUpdatedAt ?? previous?.payload.generatedAt,
    socialAnalyzedAt: previous?.payload.socialAnalyzedAt ?? previous?.payload.socialUpdatedAt ?? previous?.payload.generatedAt,
    previousSocial: previous?.payload.social,
    prepared,
  };
}

// X는 유료 호출이므로 실패 시 Workflow가 자동으로 같은 수집을 반복하지 않는다.
collectSocialPosts.maxRetries = 0;

async function loadStoredSocialPosts(): Promise<SocialWorkflowContext> {
  "use step";
  const missing = getMissingConfiguration("social", "analyze_only");
  if (missing.length) throw new Error(`설정되지 않은 환경 변수: ${missing.join(", ")}`);

  const previous = await getLatestSnapshot();
  if (!previous?.payload.social.posts.length) {
    throw new Error("먼저 X 게시물 수집만 실행해 저장된 게시물을 만드세요.");
  }
  const analysisModel = process.env.OPENAI_MODEL ?? "gpt-5-nano";
  const rawPosts = previous.payload.social.posts.map(({ mentions: _mentions, translationKo: _translationKo, analyzed: _analyzed, ...post }) => {
    void _mentions;
    void _translationKo;
    void _analyzed;
    return post;
  });
  return {
    generatedAt: new Date().toISOString(),
    macro: previous.payload.macro,
    macroUpdatedAt: previous.payload.macroUpdatedAt ?? previous.payload.generatedAt,
    socialCollectedAt: previous.payload.socialCollectedAt ?? previous.payload.socialUpdatedAt ?? previous.payload.generatedAt,
    socialAnalyzedAt: previous.payload.socialAnalyzedAt ?? previous.payload.socialUpdatedAt ?? previous.payload.generatedAt,
    previousSocial: previous.payload.social,
    prepared: {
      analysisModel,
      periodDays: previous.payload.social.periodDays,
      accounts: previous.payload.social.accounts,
      rawPosts,
      postsToAnalyze: rawPosts,
      reusedAnalysis: [],
    },
  };
}

async function analyzeSocialBatch(posts: RawSocialPost[], model: string): Promise<PostAnalysisResult[]> {
  "use step";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("설정되지 않은 환경 변수: OPENAI_API_KEY");
  return analyzePostBatchWithOpenAI(posts, apiKey, model);
}

// 시간 초과된 요청도 OpenAI에서 처리됐을 수 있으므로 자동 재호출하지 않는다.
analyzeSocialBatch.maxRetries = 0;

async function analyzeSocialTopics(posts: RawSocialPost[]): Promise<TopicStepResult> {
  "use step";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_TOPIC_MODEL ?? "gpt-5-mini";
  if (!apiKey) return { model, topics: [], error: "설정되지 않은 환경 변수: OPENAI_API_KEY" };
  try {
    return { model, topics: await analyzeTopicsWithOpenAI(posts, apiKey, model) };
  } catch (error) {
    return { model, topics: [], error: refreshErrorMessage(error) };
  }
}

// 주제 요약도 유료 호출이므로 Workflow 수준의 자동 재호출은 하지 않는다.
analyzeSocialTopics.maxRetries = 0;

async function storeSocialDraft(
  runId: string,
  context: SocialWorkflowContext,
  analysis: PostAnalysisResult[],
  topicResult: TopicStepResult,
) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");

  const social = finalizeXCollection(context.prepared, analysis);
  const snapshot: DashboardSnapshot = {
    version: 1,
    generatedAt: context.generatedAt,
    refreshSource: "social",
    macroUpdatedAt: context.macroUpdatedAt,
    socialUpdatedAt: context.generatedAt,
    socialCollectedAt: context.socialCollectedAt ?? context.generatedAt,
    socialAnalyzedAt: context.generatedAt,
    macro: context.macro,
    social: {
      ...social,
      topicModel: topicResult.model,
      topicSummaryError: topicResult.error,
      topicSummaryStale: false,
      topics: topicResult.topics,
    },
  };
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`수집 결과 임시 저장 실패: ${error.message}`);
}

async function storeSocialCollectionDraft(runId: string, context: SocialWorkflowContext) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");

  const social = finalizeXCollectionWithoutAnalysis(context.prepared, context.previousSocial);
  const snapshot: DashboardSnapshot = {
    version: 1,
    generatedAt: context.generatedAt,
    refreshSource: "social",
    macroUpdatedAt: context.macroUpdatedAt,
    socialUpdatedAt: context.generatedAt,
    socialCollectedAt: context.generatedAt,
    socialAnalyzedAt: context.socialAnalyzedAt,
    macro: context.macro,
    social: {
      ...social,
      topicModel: context.previousSocial?.topicModel,
      topicSummaryError: context.previousSocial?.topicSummaryError,
      topicSummaryStale: true,
      topics: context.previousSocial?.topics,
    },
  };
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`X 수집 결과 임시 저장 실패: ${error.message}`);
}

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

export async function refreshDataWorkflow(
  runId: string,
  source: RefreshSource,
  socialMode: SocialRefreshMode = "collect_and_analyze",
) {
  "use workflow";
  let stage = "갱신 준비";
  try {
    await setRefreshStage(runId, "collecting");
    let generatedAt: string;
    if (source === "macro") {
      stage = "매크로 지표 수집";
      generatedAt = await collectMacroAndStoreDraft(runId);
    } else if (socialMode === "collect_only") {
      stage = "X 게시물만 수집";
      const context = await collectSocialPosts();
      stage = "X 원문 임시 저장";
      await storeSocialCollectionDraft(runId, context);
      generatedAt = context.generatedAt;
    } else {
      stage = socialMode === "analyze_only" ? "저장된 X 게시물 준비" : "X 게시물 수집";
      const context = socialMode === "analyze_only" ? await loadStoredSocialPosts() : await collectSocialPosts();
      const posts = context.prepared.postsToAnalyze;
      const batchCount = Math.ceil(posts.length / OPENAI_BATCH_SIZE);
      const analysis: PostAnalysisResult[] = [];
      for (let index = 0; index < posts.length; index += OPENAI_BATCH_SIZE) {
        const batchNumber = Math.floor(index / OPENAI_BATCH_SIZE) + 1;
        stage = `OpenAI 기업 분석 ${batchNumber}/${batchCount}`;
        analysis.push(...await analyzeSocialBatch(
          posts.slice(index, index + OPENAI_BATCH_SIZE),
          context.prepared.analysisModel,
        ));
      }
      stage = "전체 주제 요약";
      const topicResult = await analyzeSocialTopics(context.prepared.rawPosts);
      stage = "수집 결과 임시 저장";
      await storeSocialDraft(runId, context, analysis, topicResult);
      generatedAt = context.generatedAt;
    }
    stage = "스냅샷 저장";
    await publishRefresh(runId);
    return { ok: true, generatedAt };
  } catch (error) {
    const message = `${stage}: ${refreshErrorMessage(error)}`;
    const recovered = await recoverDraftOrFail(runId, message);
    return recovered ? { ok: true, recovered: true } : { ok: false, error: message };
  }
}
