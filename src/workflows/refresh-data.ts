import { collectRefreshSnapshot, refreshErrorMessage } from "@/lib/refresh-runner";
import { collectAlphaVantageMarketBatch, collectAlphaVantagePortfolioBatch } from "@/lib/alpha-vantage-market-data";
import { collectMarketResearchData, collectMacroResearchData } from "@/lib/investor-research";
import { collectMarketBatch, collectPortfolioMarketBatch, MARKET_CORE_IDS, MARKET_COUNTRY_IDS, MARKET_PRIMARY_IDS, MARKET_SIGNAL_IDS, type MarketBatchResult } from "@/lib/market-data";
import { DEFAULT_OPENAI_ANALYSIS_MODEL, DEFAULT_OPENAI_TOPIC_MODEL } from "@/lib/openai-config";
import { analyzePostBatchWithOpenAI, OPENAI_BATCH_SIZE, SOCIAL_ANALYSIS_PROMPT_VERSION, type PostAnalysisResult } from "@/lib/social-analysis";
import { getInvestorResearchState, getLatestSnapshot, getMissingConfiguration, getPortfolioItems, getSupabaseAdmin, getXMonitorSettings, getXTickerMonitorSettings, recordRefreshMetric, saveMacroResearchPayload, saveMarketResearchPayload } from "@/lib/supabase";
import { analyzeTopicsWithOpenAI, TOPIC_ANALYSIS_PROMPT_VERSION } from "@/lib/topic-analysis";
import type { DashboardSnapshot, MacroSeries, MarketSeries, MarketSnapshot, PortfolioItem, RefreshSource, RefreshTarget, SocialCollectionScope, SocialRefreshMode, TopicSummary } from "@/lib/types";
import { finalizeXCollection, finalizeXCollectionWithoutAnalysis, prepareXCollection, prepareXTickerCollection, type PreparedXCollection, type RawSocialPost } from "@/lib/x-api";
import { queueLatestComprehensiveAnalysis } from "@/workflows/comprehensive-analysis";
import { sleep } from "workflow";

interface SocialWorkflowContext {
  generatedAt: string;
  refreshSource: "social" | "all";
  macro: MacroSeries[];
  macroUpdatedAt?: string;
  macroWarnings?: string[];
  market?: MarketSnapshot;
  marketUpdatedAt?: string;
  socialCollectedAt?: string;
  socialAnalyzedAt?: string;
  socialAccountCollectedAt?: string;
  socialAccountAnalyzedAt?: string;
  socialTickerCollectedAt?: string;
  socialTickerAnalyzedAt?: string;
  scope: SocialCollectionScope;
  collectedAccounts: boolean;
  collectedTickers: boolean;
  previousSocial?: DashboardSnapshot["social"];
  prepared: PreparedXCollection;
}

interface TopicStepResult {
  model: string;
  topics: TopicSummary[];
  error?: string;
}

function isTickerPost(post: RawSocialPost | DashboardSnapshot["social"]["posts"][number]) {
  return post.source === "ticker" || Boolean(post.matchedTickers?.length);
}

function isPostInScope(post: RawSocialPost | DashboardSnapshot["social"]["posts"][number], scope: SocialCollectionScope) {
  if (scope === "all") return true;
  return scope === "tickers" ? isTickerPost(post) : post.source !== "ticker";
}

function keepUnscopedAnalysis(
  prepared: PreparedXCollection,
  previous: DashboardSnapshot["social"] | undefined,
  scope: SocialCollectionScope,
): PreparedXCollection {
  if (!previous || scope === "all") return prepared;
  const reused = new Map(prepared.reusedAnalysis.map((analysis) => [analysis.id, analysis]));
  for (const post of previous.posts) {
    if (!isPostInScope(post, scope) && prepared.rawPosts.some((raw) => raw.id === post.id)) {
      reused.set(post.id, { id: post.id, mentions: post.mentions, translationKo: post.translationKo ?? "" });
    }
  }
  return {
    ...prepared,
    postsToAnalyze: prepared.postsToAnalyze.filter((post) => isPostInScope(post, scope)),
    reusedAnalysis: [...reused.values()],
  };
}

function mergeScopedTopics(context: SocialWorkflowContext, fresh: TopicSummary[]) {
  if (context.scope === "all") return fresh;
  const rawById = new Map(context.prepared.rawPosts.map((post) => [post.id, post]));
  const preserved = (context.previousSocial?.topics ?? []).flatMap((topic) => {
    const postIds = topic.postIds.filter((id) => {
      const post = rawById.get(id);
      return post ? !isPostInScope(post, context.scope) : false;
    });
    return postIds.length ? [{ ...topic, postIds, postCount: postIds.length }] : [];
  });
  return [...fresh, ...preserved]
    .sort((left, right) => right.postCount - left.postCount || left.title.localeCompare(right.title, "ko"));
}

async function setRefreshStage(runId: string, stage: "collecting" | "saving") {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { error } = await supabase.rpc("set_refresh_stage", { p_run_id: runId, p_stage: stage });
  if (error) throw new Error(`갱신 상태 저장 실패: ${error.message}`);
}

async function collectMacroAndStoreDraft(runId: string, refreshSource: "macro" | "all" = "macro") {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");

  const collected = await collectRefreshSnapshot("macro");
  const snapshot: DashboardSnapshot = { ...collected.snapshot, refreshSource };
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`수집 결과 임시 저장 실패: ${error.message}`);
  await recordRefreshMetric(runId, "macro", collected.metrics);
  return snapshot.generatedAt;
}

// 외부 지표 호출은 수집기 내부에서 항목별로 복구한다. HTML 오류나 호출 제한 때 전체 묶음을 자동 재호출하지 않는다.
collectMacroAndStoreDraft.maxRetries = 0;

async function collectPrimaryMarketData(): Promise<MarketBatchResult> {
  "use step";
  if (process.env.TWELVE_DATA_API_KEY) return collectMarketBatch(process.env.TWELVE_DATA_API_KEY, MARKET_CORE_IDS);
  if (process.env.ALPHA_VANTAGE_API_KEY) return collectAlphaVantageMarketBatch(process.env.ALPHA_VANTAGE_API_KEY, MARKET_CORE_IDS);
  throw new Error("설정되지 않은 환경 변수: ALPHA_VANTAGE_API_KEY 또는 TWELVE_DATA_API_KEY");
}

async function collectSignalMarketData(): Promise<MarketBatchResult> {
  "use step";
  try {
    if (process.env.TWELVE_DATA_API_KEY) return await collectMarketBatch(process.env.TWELVE_DATA_API_KEY, MARKET_SIGNAL_IDS);
    if (process.env.ALPHA_VANTAGE_API_KEY) return await collectAlphaVantageMarketBatch(process.env.ALPHA_VANTAGE_API_KEY, MARKET_SIGNAL_IDS);
    throw new Error("설정되지 않은 환경 변수: ALPHA_VANTAGE_API_KEY 또는 TWELVE_DATA_API_KEY");
  } catch (error) {
    return { provider: process.env.TWELVE_DATA_API_KEY ? "Twelve Data" : "Alpha Vantage", series: [], warnings: [`시장 내부 신호: 이전 값 유지 · ${refreshErrorMessage(error)}`] };
  }
}

async function collectCountryMarketData(): Promise<MarketBatchResult> {
  "use step";
  try {
    if (process.env.TWELVE_DATA_API_KEY) return await collectMarketBatch(process.env.TWELVE_DATA_API_KEY, MARKET_COUNTRY_IDS);
    if (process.env.ALPHA_VANTAGE_API_KEY) return await collectAlphaVantageMarketBatch(process.env.ALPHA_VANTAGE_API_KEY, MARKET_COUNTRY_IDS);
    throw new Error("설정되지 않은 환경 변수: ALPHA_VANTAGE_API_KEY 또는 TWELVE_DATA_API_KEY");
  } catch (error) {
    return { provider: process.env.TWELVE_DATA_API_KEY ? "Twelve Data" : "Alpha Vantage", series: [], warnings: [`국가 ETF: 이전 값 유지 · ${refreshErrorMessage(error)}`] };
  }
}

async function collectPortfolioMarketData(tickers: string[]): Promise<MarketBatchResult> {
  "use step";
  try {
    if (process.env.TWELVE_DATA_API_KEY) return await collectPortfolioMarketBatch(process.env.TWELVE_DATA_API_KEY, tickers);
    if (process.env.ALPHA_VANTAGE_API_KEY) return await collectAlphaVantagePortfolioBatch(process.env.ALPHA_VANTAGE_API_KEY, tickers);
    return { provider: "Twelve Data", series: [], warnings: ["시장 데이터 API 키가 없어 관심종목 가격을 갱신하지 못했습니다."] };
  } catch (error) {
    return { provider: process.env.TWELVE_DATA_API_KEY ? "Twelve Data" : "Alpha Vantage", series: [], warnings: [`관심종목 가격: 이전 값 유지 · ${refreshErrorMessage(error)}`] };
  }
}

// 무료 플랜의 분당 크레딧을 소진하는 단계라 동일 요청을 자동 반복하지 않는다.
collectPrimaryMarketData.maxRetries = 0;
collectSignalMarketData.maxRetries = 0;
collectCountryMarketData.maxRetries = 0;
collectPortfolioMarketData.maxRetries = 0;

function combineMarketBatches(...batches: MarketBatchResult[]): MarketBatchResult {
  const provider = batches.find((batch) => batch.series.length)?.provider ?? batches[0]?.provider ?? "Twelve Data";
  const byId = new Map<string, MarketSeries>();
  for (const batch of batches) {
    for (const series of batch.series) byId.set(series.id, series);
  }
  return {
    provider,
    series: [...byId.values()],
    warnings: [...new Set(batches.flatMap((batch) => batch.warnings))],
  };
}

async function collectMacroResearch(runId: string) {
  "use step";
  const previous = (await getInvestorResearchState()).macro;
  const result = await collectMacroResearchData(process.env.FRED_API_KEY!, process.env.EIA_API_KEY, previous);
  const { metrics, ...payload } = result;
  await saveMacroResearchPayload(payload);
  await recordRefreshMetric(runId, "macro_research", metrics);
}

// 보조 리서치 소스는 각 수집기 내부에서 부분 실패를 이전 값으로 복구한다.
collectMacroResearch.maxRetries = 0;

async function loadPortfolio(): Promise<PortfolioItem[]> {
  "use step";
  return (await getPortfolioItems()).items;
}

async function collectAndStoreMarketResearch(
  runId: string,
  portfolioItems: PortfolioItem[],
  prices: MarketSeries[],
  priceWarnings: string[],
) {
  "use step";
  const previous = (await getInvestorResearchState()).market;
  const result = await collectMarketResearchData(
    portfolioItems,
    prices,
    priceWarnings,
    process.env.ALPHA_VANTAGE_API_KEY,
    process.env.SEC_USER_AGENT,
    previous,
  );
  const { metrics, ...payload } = result;
  await saveMarketResearchPayload(payload);
  await recordRefreshMetric(runId, "market_research", metrics);
}

// SEC·실적 일정의 일시 오류 때문에 가격 스냅샷 전체를 재호출하지 않는다.
collectAndStoreMarketResearch.maxRetries = 0;

async function getRefreshDraft(runId: string): Promise<DashboardSnapshot | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { data, error } = await supabase.from("refresh_runs").select("draft_payload").eq("id", runId).maybeSingle();
  if (error) throw new Error(`갱신 임시 데이터 조회 실패: ${error.message}`);
  return (data?.draft_payload as DashboardSnapshot | null | undefined) ?? null;
}

async function storeMarketDraft(
  runId: string,
  primary: MarketBatchResult,
  countries: MarketBatchResult,
  refreshSource: "market" | "all" = "market",
): Promise<string> {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const stored = await getRefreshDraft(runId);
  const previous = stored ? null : await getLatestSnapshot();
  const base = stored ?? previous?.payload;
  const generatedAt = new Date().toISOString();
  const mergeSeries = (stored: MarketSnapshot["series"] | undefined, fresh: MarketSnapshot["series"], order: string[]) => {
    const byId = new Map((stored ?? []).map((series) => [series.id, series]));
    for (const series of fresh) byId.set(series.id, series);
    return order.map((id) => byId.get(id)).filter((series): series is MarketSnapshot["series"][number] => Boolean(series));
  };
  const snapshot: DashboardSnapshot = {
    version: 1,
    generatedAt,
    refreshSource,
    macroUpdatedAt: base?.macroUpdatedAt ?? base?.generatedAt,
    macroWarnings: base?.macroWarnings,
    marketUpdatedAt: generatedAt,
    socialUpdatedAt: base?.socialUpdatedAt,
    socialCollectedAt: base?.socialCollectedAt,
    socialAnalyzedAt: base?.socialAnalyzedAt,
    socialAccountCollectedAt: base?.socialAccountCollectedAt,
    socialAccountAnalyzedAt: base?.socialAccountAnalyzedAt,
    socialTickerCollectedAt: base?.socialTickerCollectedAt,
    socialTickerAnalyzedAt: base?.socialTickerAnalyzedAt,
    macro: base?.macro ?? [],
    market: {
      provider: primary.provider,
      peakWindowYears: 3,
      series: mergeSeries(base?.market?.series, primary.series.filter((series) => series.group === "market"), MARKET_PRIMARY_IDS),
      countryEtfs: mergeSeries(base?.market?.countryEtfs, countries.series.filter((series) => series.group === "country"), MARKET_COUNTRY_IDS),
      warnings: [...new Set([
        ...(stored?.market?.warnings ?? []).filter((warning) => !warning.includes("아직 수집 중")),
        ...primary.warnings,
        ...countries.warnings,
      ])],
    },
    social: base?.social ?? {
      periodDays: 7,
      accounts: [],
      posts: [],
      companies: [],
      analyzedPostCount: 0,
    },
  };
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`시장 데이터 임시 저장 실패: ${error.message}`);
  await recordRefreshMetric(runId, `market_${primary.series[0]?.id ?? countries.series[0]?.id ?? "batch"}`, {
    provider: primary.provider,
    requestedSeries: primary.series.length + primary.warnings.length + countries.series.length + countries.warnings.length,
    storedSeries: primary.series.length + countries.series.length,
    warnings: primary.warnings.length + countries.warnings.length,
  });
  return generatedAt;
}

async function collectSocialPosts(runId?: string, scope: SocialCollectionScope = "accounts"): Promise<SocialWorkflowContext> {
  "use step";
  const missing = getMissingConfiguration("social", "collect_only");
  if (missing.length) throw new Error(`설정되지 않은 환경 변수: ${missing.join(", ")}`);

  const stored = runId ? await getRefreshDraft(runId) : null;
  const previous = stored ? null : await getLatestSnapshot();
  const base = stored ?? previous?.payload;
  const analysisModel = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_ANALYSIS_MODEL;
  const accountSettings = scope === "tickers" ? null : await getXMonitorSettings();
  const tickerSettings = scope === "accounts" ? null : await getXTickerMonitorSettings();
  if (scope === "accounts" && !accountSettings?.usernames.length) throw new Error("계정 설정에서 활성 계정을 한 개 이상 선택하세요.");
  if (scope === "tickers" && !tickerSettings?.activeTickers.length) throw new Error("티커 모니터링에서 활성 티커를 한 개 이상 선택하세요.");
  if (scope === "all" && !accountSettings?.usernames.length && !tickerSettings?.activeTickers.length) throw new Error("활성화된 X 계정 또는 티커를 한 개 이상 설정하세요.");

  let prepared: PreparedXCollection | null = null;
  if (accountSettings?.usernames.length) {
    prepared = await prepareXCollection(
      process.env.X_BEARER_TOKEN!, accountSettings.usernames, accountSettings.lookbackDays,
      accountSettings.perAccountPostLimit, accountSettings.totalPostLimit, analysisModel, base?.social,
    );
  }
  if (tickerSettings?.activeTickers.length) {
    const tickerBase = prepared ? finalizeXCollectionWithoutAnalysis(prepared, base?.social) : base?.social;
    prepared = await prepareXTickerCollection(
      process.env.X_BEARER_TOKEN!, tickerSettings.activeTickers, tickerSettings.lookbackDays,
      tickerSettings.perTickerPostLimit, tickerSettings.totalPostLimit, analysisModel, tickerBase,
    );
  }
  if (!prepared) throw new Error("X 수집 대상을 준비하지 못했습니다.");
  prepared = keepUnscopedAnalysis(prepared, base?.social, scope);
  return {
    generatedAt: new Date().toISOString(),
    refreshSource: runId ? "all" : "social",
    macro: base?.macro ?? [],
    macroUpdatedAt: base?.macroUpdatedAt ?? base?.generatedAt,
    macroWarnings: base?.macroWarnings,
    market: base?.market,
    marketUpdatedAt: base?.marketUpdatedAt,
    socialAnalyzedAt: base?.socialAnalyzedAt ?? base?.socialUpdatedAt ?? base?.generatedAt,
    socialAccountCollectedAt: base?.socialAccountCollectedAt,
    socialAccountAnalyzedAt: base?.socialAccountAnalyzedAt,
    socialTickerCollectedAt: base?.socialTickerCollectedAt,
    socialTickerAnalyzedAt: base?.socialTickerAnalyzedAt,
    scope,
    collectedAccounts: Boolean(accountSettings?.usernames.length),
    collectedTickers: Boolean(tickerSettings?.activeTickers.length),
    previousSocial: base?.social,
    prepared,
  };
}

// X는 유료 호출이므로 실패 시 Workflow가 자동으로 같은 수집을 반복하지 않는다.
collectSocialPosts.maxRetries = 0;

async function loadStoredSocialPosts(scope: SocialCollectionScope = "all"): Promise<SocialWorkflowContext> {
  "use step";
  const missing = getMissingConfiguration("social", "analyze_only");
  if (missing.length) throw new Error(`설정되지 않은 환경 변수: ${missing.join(", ")}`);

  const previous = await getLatestSnapshot();
  if (!previous?.payload.social.posts.length) {
    throw new Error("먼저 X 게시물 수집만 실행해 저장된 게시물을 만드세요.");
  }
  const analysisModel = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_ANALYSIS_MODEL;
  const rawPosts = previous.payload.social.posts.map(({ mentions: _mentions, translationKo: _translationKo, analyzed: _analyzed, ...post }) => {
    void _mentions;
    void _translationKo;
    void _analyzed;
    return post;
  });
  return {
    generatedAt: new Date().toISOString(),
    refreshSource: "social",
    macro: previous.payload.macro,
    macroUpdatedAt: previous.payload.macroUpdatedAt ?? previous.payload.generatedAt,
    macroWarnings: previous.payload.macroWarnings,
    market: previous.payload.market,
    marketUpdatedAt: previous.payload.marketUpdatedAt,
    socialCollectedAt: previous.payload.socialCollectedAt ?? previous.payload.socialUpdatedAt ?? previous.payload.generatedAt,
    socialAnalyzedAt: previous.payload.socialAnalyzedAt ?? previous.payload.socialUpdatedAt ?? previous.payload.generatedAt,
    socialAccountCollectedAt: previous.payload.socialAccountCollectedAt,
    socialAccountAnalyzedAt: previous.payload.socialAccountAnalyzedAt,
    socialTickerCollectedAt: previous.payload.socialTickerCollectedAt,
    socialTickerAnalyzedAt: previous.payload.socialTickerAnalyzedAt,
    scope,
    previousSocial: previous.payload.social,
    prepared: {
      analysisModel,
      analysisPromptVersion: SOCIAL_ANALYSIS_PROMPT_VERSION,
      periodDays: previous.payload.social.periodDays,
      accounts: previous.payload.social.accounts,
      rawPosts,
      postsToAnalyze: rawPosts.filter((post) => isPostInScope(post, scope)),
      reusedAnalysis: previous.payload.social.posts.flatMap((post) => !isPostInScope(post, scope)
        ? [{ id: post.id, mentions: post.mentions, translationKo: post.translationKo ?? "" }]
        : []),
      collectionWarnings: previous.payload.social.collectionWarnings ?? [],
      collectionMetrics: previous.payload.social.collectionMetrics ?? {
        apiCalls: 0,
        targetsAttempted: 0,
        targetsSucceeded: 0,
        targetsFailed: 0,
        fetchedPosts: 0,
        reusedAnalyses: 0,
        pendingAnalyses: rawPosts.filter((post) => isPostInScope(post, scope)).length,
      },
      tickerPeriodDays: previous.payload.social.tickerPeriodDays,
      tickers: previous.payload.social.tickers,
    },
    collectedAccounts: false,
    collectedTickers: false,
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
  const model = process.env.OPENAI_TOPIC_MODEL ?? DEFAULT_OPENAI_TOPIC_MODEL;
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
    refreshSource: context.refreshSource,
    macroUpdatedAt: context.macroUpdatedAt,
    macroWarnings: context.macroWarnings,
    marketUpdatedAt: context.marketUpdatedAt,
    socialUpdatedAt: context.generatedAt,
    socialCollectedAt: context.socialCollectedAt ?? context.generatedAt,
    socialAnalyzedAt: context.generatedAt,
    socialAccountCollectedAt: context.collectedAccounts ? context.generatedAt : context.socialAccountCollectedAt,
    socialAccountAnalyzedAt: context.prepared.rawPosts.some((post) => isPostInScope(post, "accounts")) && (context.scope === "accounts" || context.scope === "all") ? context.generatedAt : context.socialAccountAnalyzedAt,
    socialTickerCollectedAt: context.collectedTickers ? context.generatedAt : context.socialTickerCollectedAt,
    socialTickerAnalyzedAt: context.prepared.rawPosts.some((post) => isPostInScope(post, "tickers")) && (context.scope === "tickers" || context.scope === "all") ? context.generatedAt : context.socialTickerAnalyzedAt,
    macro: context.macro,
    market: context.market,
    social: {
      ...social,
      topicModel: topicResult.model,
      topicPromptVersion: TOPIC_ANALYSIS_PROMPT_VERSION,
      topicSummaryError: topicResult.error,
      topicSummaryStale: false,
      topics: mergeScopedTopics(context, topicResult.topics),
    },
  };
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`수집 결과 임시 저장 실패: ${error.message}`);
  await recordRefreshMetric(runId, "openai_social", {
    model: context.prepared.analysisModel,
    promptVersion: context.prepared.analysisPromptVersion,
    analyzedPosts: analysis.length,
    reusedAnalyses: context.prepared.reusedAnalysis.length,
    batches: Math.ceil(context.prepared.postsToAnalyze.length / OPENAI_BATCH_SIZE),
    topicModel: topicResult.model,
    topicPromptVersion: TOPIC_ANALYSIS_PROMPT_VERSION,
    topics: topicResult.topics.length,
    topicError: Boolean(topicResult.error),
  });
}

async function storeSocialCollectionDraft(runId: string, context: SocialWorkflowContext) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");

  const social = finalizeXCollectionWithoutAnalysis(context.prepared, context.previousSocial);
  const snapshot: DashboardSnapshot = {
    version: 1,
    generatedAt: context.generatedAt,
    refreshSource: context.refreshSource,
    macroUpdatedAt: context.macroUpdatedAt,
    macroWarnings: context.macroWarnings,
    marketUpdatedAt: context.marketUpdatedAt,
    socialUpdatedAt: context.generatedAt,
    socialCollectedAt: context.generatedAt,
    socialAnalyzedAt: context.socialAnalyzedAt,
    socialAccountCollectedAt: context.collectedAccounts ? context.generatedAt : context.socialAccountCollectedAt,
    socialAccountAnalyzedAt: context.socialAccountAnalyzedAt,
    socialTickerCollectedAt: context.collectedTickers ? context.generatedAt : context.socialTickerCollectedAt,
    socialTickerAnalyzedAt: context.socialTickerAnalyzedAt,
    macro: context.macro,
    market: context.market,
    social: {
      ...social,
      topicModel: context.previousSocial?.topicModel,
      topicPromptVersion: context.previousSocial?.topicPromptVersion,
      topicSummaryError: context.previousSocial?.topicSummaryError,
      topicSummaryStale: true,
      topics: context.previousSocial?.topics,
    },
  };
  const { error } = await supabase.rpc("save_refresh_draft", { p_run_id: runId, p_payload: snapshot });
  if (error) throw new Error(`X 수집 결과 임시 저장 실패: ${error.message}`);
  await recordRefreshMetric(runId, "x_collection", context.prepared.collectionMetrics);
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
  selectedTargets?: RefreshTarget[],
  comprehensiveModel?: string,
  socialScope: SocialCollectionScope = "accounts",
) {
  "use workflow";
  let stage = "갱신 준비";
  try {
    await setRefreshStage(runId, "collecting");
    let generatedAt = new Date().toISOString();
    if (source === "all") {
      const targets = new Set<RefreshTarget>(selectedTargets?.length ? selectedTargets : ["macro", "market", "social"]);
      if (targets.has("macro")) {
        stage = "선택 갱신 · 매크로 지표 수집";
        generatedAt = await collectMacroAndStoreDraft(runId, "all");
        stage = "선택 갱신 · 경제 일정·원유 수급·선물 포지셔닝";
        await collectMacroResearch(runId);
        await setRefreshStage(runId, "collecting");
      }

      if (targets.has("market")) {
        stage = "선택 갱신 · 주요 시장지수 수집";
        const core = await collectPrimaryMarketData();
        await storeMarketDraft(runId, core, {
          provider: core.provider,
          series: [],
          warnings: ["시장 내부 신호와 국가 ETF는 아직 수집 중입니다."],
        }, "all");
        await setRefreshStage(runId, "collecting");
        if (core.provider === "Twelve Data") {
          stage = "선택 갱신 · 무료 API 호출 한도 대기";
          await sleep("61s");
        } else {
          stage = "선택 갱신 · 무료 API 호출 간격 대기";
          await sleep("2s");
        }
        stage = "선택 갱신 · 시장 폭·신용·위험선호 신호 수집";
        const signal = await collectSignalMarketData();
        const primary = combineMarketBatches(core, signal);
        await storeMarketDraft(runId, primary, {
          provider: primary.provider,
          series: [],
          warnings: ["국가 ETF 비교 데이터는 아직 수집 중입니다."],
        }, "all");
        await setRefreshStage(runId, "collecting");
        if (primary.provider === "Twelve Data") await sleep("61s");
        else await sleep("2s");
        stage = "선택 갱신 · 국가 ETF 수집";
        const countries = await collectCountryMarketData();
        generatedAt = await storeMarketDraft(runId, primary, countries, "all");
        await setRefreshStage(runId, "collecting");

        const portfolioItems = await loadPortfolio();
        const portfolioTickers = portfolioItems.filter((item) => item.enabled).map((item) => item.ticker);
        const reusablePrices = [...primary.series, ...countries.series].filter((series) => portfolioTickers.includes(series.symbol));
        const reusableSymbols = new Set(reusablePrices.map((series) => series.symbol));
        const portfolioFetchTickers = portfolioTickers.filter((ticker) => !reusableSymbols.has(ticker));
        const portfolioBatches: MarketBatchResult[] = [];
        for (let index = 0; index < portfolioFetchTickers.length; index += 8) {
          if (primary.provider === "Twelve Data") {
            stage = "선택 갱신 · 관심종목 호출 한도 대기";
            await sleep("61s");
          }
          stage = `선택 갱신 · 관심종목 가격 ${Math.floor(index / 8) + 1}/${Math.ceil(portfolioFetchTickers.length / 8)}`;
          portfolioBatches.push(await collectPortfolioMarketData(portfolioFetchTickers.slice(index, index + 8)));
        }
        const portfolio = combineMarketBatches(
          { provider: primary.provider, series: reusablePrices, warnings: [] },
          ...portfolioBatches,
        );
        stage = "선택 갱신 · 관심종목 공시·실적 일정";
        await collectAndStoreMarketResearch(runId, portfolioItems, portfolio.series, portfolio.warnings);
      }

      if (targets.has("social")) {
        stage = "선택 갱신 · X 게시물 수집";
        const context = await collectSocialPosts(runId, socialScope);
        stage = "선택 갱신 · X 원문 우선 저장";
        await storeSocialCollectionDraft(runId, context);
        await setRefreshStage(runId, "collecting");
        const posts = context.prepared.postsToAnalyze;
        const batchCount = Math.ceil(posts.length / OPENAI_BATCH_SIZE);
        const analysis: PostAnalysisResult[] = [];
        for (let index = 0; index < posts.length; index += OPENAI_BATCH_SIZE) {
          const batchNumber = Math.floor(index / OPENAI_BATCH_SIZE) + 1;
          stage = `선택 갱신 · OpenAI 기업 분석 ${batchNumber}/${batchCount}`;
          analysis.push(...await analyzeSocialBatch(
            posts.slice(index, index + OPENAI_BATCH_SIZE),
            context.prepared.analysisModel,
          ));
        }
        stage = "선택 갱신 · 전체 주제 요약";
        const topicResult = await analyzeSocialTopics(context.prepared.rawPosts.filter((post) => isPostInScope(post, context.scope)));
        stage = "선택 갱신 · 최종 결과 임시 저장";
        await storeSocialDraft(runId, context, analysis, topicResult);
        generatedAt = context.generatedAt;
      }
    } else if (source === "macro") {
      stage = "매크로 지표 수집";
      generatedAt = await collectMacroAndStoreDraft(runId);
      stage = "경제 일정·원유 수급·선물 포지셔닝";
      await collectMacroResearch(runId);
    } else if (source === "market") {
      stage = "주요 시장지수 수집";
      const core = await collectPrimaryMarketData();
      stage = "주요 시장지수 우선 저장";
      await storeMarketDraft(runId, core, {
        provider: core.provider,
        series: [],
        warnings: ["시장 내부 신호와 국가 ETF는 아직 수집 중입니다."],
      });
      await setRefreshStage(runId, "collecting");
      if (core.provider === "Twelve Data") {
        stage = "무료 API 호출 한도 대기";
        await sleep("61s");
      } else {
        stage = "무료 API 호출 간격 대기";
        await sleep("2s");
      }
      stage = "시장 폭·신용·위험선호 신호 수집";
      const signal = await collectSignalMarketData();
      const primary = combineMarketBatches(core, signal);
      await storeMarketDraft(runId, primary, {
        provider: primary.provider,
        series: [],
        warnings: ["국가 ETF 비교 데이터는 아직 수집 중입니다."],
      });
      await setRefreshStage(runId, "collecting");
      if (primary.provider === "Twelve Data") await sleep("61s");
      else await sleep("2s");
      stage = "국가 ETF 수집";
      const countries = await collectCountryMarketData();
      stage = "시장 데이터 임시 저장";
      generatedAt = await storeMarketDraft(runId, primary, countries);
      await setRefreshStage(runId, "collecting");

      const portfolioItems = await loadPortfolio();
      const portfolioTickers = portfolioItems.filter((item) => item.enabled).map((item) => item.ticker);
      const reusablePrices = [...primary.series, ...countries.series].filter((series) => portfolioTickers.includes(series.symbol));
      const reusableSymbols = new Set(reusablePrices.map((series) => series.symbol));
      const portfolioFetchTickers = portfolioTickers.filter((ticker) => !reusableSymbols.has(ticker));
      const portfolioBatches: MarketBatchResult[] = [];
      for (let index = 0; index < portfolioFetchTickers.length; index += 8) {
        if (primary.provider === "Twelve Data") {
          stage = "관심종목 호출 한도 대기";
          await sleep("61s");
        }
        stage = `관심종목 가격 ${Math.floor(index / 8) + 1}/${Math.ceil(portfolioFetchTickers.length / 8)}`;
        portfolioBatches.push(await collectPortfolioMarketData(portfolioFetchTickers.slice(index, index + 8)));
      }
      const portfolio = combineMarketBatches(
        { provider: primary.provider, series: reusablePrices, warnings: [] },
        ...portfolioBatches,
      );
      stage = "관심종목 공시·실적 일정";
      await collectAndStoreMarketResearch(runId, portfolioItems, portfolio.series, portfolio.warnings);
    } else if (socialMode === "collect_only") {
      stage = "X 게시물만 수집";
      const context = await collectSocialPosts(undefined, socialScope);
      stage = "X 원문 임시 저장";
      await storeSocialCollectionDraft(runId, context);
      generatedAt = context.generatedAt;
    } else {
      stage = socialMode === "analyze_only" ? "저장된 X 게시물 준비" : "X 게시물 수집";
      const context = socialMode === "analyze_only" ? await loadStoredSocialPosts(socialScope) : await collectSocialPosts(undefined, socialScope);
      if (socialMode !== "analyze_only") {
        stage = "X 원문 우선 저장";
        await storeSocialCollectionDraft(runId, context);
      }
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
      const topicResult = await analyzeSocialTopics(context.prepared.rawPosts.filter((post) => isPostInScope(post, context.scope)));
      stage = "수집 결과 임시 저장";
      await storeSocialDraft(runId, context, analysis, topicResult);
      generatedAt = context.generatedAt;
    }
    stage = "스냅샷 저장";
    await publishRefresh(runId);
    if (source === "all" && comprehensiveModel) {
      try {
        stage = "종합분석 작업 등록";
        const analysisRun = await queueLatestComprehensiveAnalysis(comprehensiveModel);
        return { ok: true, generatedAt, analysisQueued: true, analysisRunId: analysisRun.runId };
      } catch (error) {
        return { ok: true, generatedAt, analysisQueued: false, analysisError: refreshErrorMessage(error) };
      }
    }
    return { ok: true, generatedAt, analysisQueued: false };
  } catch (error) {
    const message = `${stage}: ${refreshErrorMessage(error)}`;
    const recovered = await recoverDraftOrFail(runId, message);
    return recovered ? { ok: true, recovered: true } : { ok: false, error: message };
  }
}
