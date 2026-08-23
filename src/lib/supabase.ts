import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseDashboardSnapshot } from "@/lib/snapshot-schema";
import type { CompanyFinancialCollection } from "@/lib/company-financials";
import type { CompanyProfileDetail, CompanyProfileNarrative, CompanyProfileRefreshRun, CompanyProfileSummary, ComprehensiveAnalysisReport, ComprehensiveAnalysisRunStatus, InvestorResearchState, MacroResearchPayload, MarketCapitalizationItem, MarketResearchPayload, PortfolioItem, RefreshMetricsRecord, RefreshRunStatus, RefreshSource, SocialRefreshMode, StoredComprehensiveAnalysis, StoredSnapshot } from "@/lib/types";

let adminClient: SupabaseClient | null | undefined;

const SUPABASE_CLOCK_RETRY_DELAYS = [0, 500, 1_500, 3_000] as const;

const retryingSupabaseFetch: typeof fetch = async (input, init) => {
  let lastResponse: Response | null = null;
  for (const delay of SUPABASE_CLOCK_RETRY_DELAYS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const requestInput = input instanceof Request ? input.clone() : input;
    const response = await fetch(requestInput, init);
    lastResponse = response;
    if (response.ok) return response;
    const body = await response.clone().text().catch(() => "");
    if (!body.toLowerCase().includes("jwt issued at future")) return response;
  }
  return lastResponse!;
};

export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    adminClient = null;
    return null;
  }
  adminClient = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: retryingSupabaseFetch },
  });
  return adminClient;
}

export async function getLatestSnapshot(): Promise<StoredSnapshot | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: state, error: stateError } = await supabase
    .from("dashboard_state")
    .select("published_snapshot_id")
    .eq("id", "primary")
    .maybeSingle();

  if (stateError) {
    if (stateError.code === "42P01") return null;
    throw new Error(`대시보드 상태 조회 실패: ${stateError.message}`);
  }
  if (!state?.published_snapshot_id) return null;

  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("id, created_at, payload")
    .eq("id", state.published_snapshot_id)
    .single();

  if (error) throw new Error(`스냅샷 조회 실패: ${error.message}`);
  return {
    id: data.id as string,
    createdAt: data.created_at as string,
    payload: parseDashboardSnapshot(data.payload),
  };
}

function mapRefreshRun(row: Record<string, unknown>): RefreshRunStatus {
  return {
    id: row.id as string,
    source: row.source === "macro" || row.source === "market" || row.source === "social" || row.source === "all" ? row.source : null,
    status: row.status as RefreshRunStatus["status"],
    stage: (row.stage as RefreshRunStatus["stage"] | undefined) ?? null,
    workflowRunId: (row.workflow_run_id as string | null | undefined) ?? null,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null | undefined) ?? null,
    error: (row.error_summary as string | null | undefined) ?? null,
  };
}

export async function getLatestRefreshRun(): Promise<RefreshRunStatus | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const full = await supabase
    .from("refresh_runs")
    .select("id, source, status, stage, workflow_run_id, started_at, finished_at, error_summary")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!full.error) return full.data ? mapRefreshRun(full.data) : null;

  const migrationMissing = full.error.code === "42703" || full.error.code === "PGRST204";
  if (!migrationMissing) {
    if (full.error.code === "42P01") return null;
    throw new Error(`갱신 상태 조회 실패: ${full.error.message}`);
  }

  const legacy = await supabase
    .from("refresh_runs")
    .select("id, status, started_at, finished_at, error_summary")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legacy.error) throw new Error(`갱신 상태 조회 실패: ${legacy.error.message}`);
  return legacy.data ? mapRefreshRun(legacy.data) : null;
}

export function getSnapshotSource(snapshot: StoredSnapshot): RefreshSource | null {
  if (snapshot.payload.refreshSource === "macro" || snapshot.payload.refreshSource === "market" || snapshot.payload.refreshSource === "social" || snapshot.payload.refreshSource === "all") {
    return snapshot.payload.refreshSource;
  }

  const generatedAt = snapshot.payload.generatedAt;
  const macroMatches = snapshot.payload.macroUpdatedAt === generatedAt;
  const marketMatches = snapshot.payload.marketUpdatedAt === generatedAt;
  const socialMatches = snapshot.payload.socialUpdatedAt === generatedAt;
  const matches = [macroMatches && "macro", marketMatches && "market", socialMatches && "social"].filter(Boolean) as RefreshSource[];
  if (matches.length === 1) return matches[0];
  return null;
}

export async function getSnapshotHistory(limit = 100): Promise<StoredSnapshot[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("id, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (error.code === "42P01") return [];
    throw new Error(`히스토리 조회 실패: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    payload: parseDashboardSnapshot(row.payload, `히스토리 스냅샷 ${row.id as string}`),
  }));
}

export async function getSnapshotById(id: string): Promise<StoredSnapshot | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("id, created_at, payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`히스토리 상세 조회 실패: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    createdAt: data.created_at as string,
    payload: parseDashboardSnapshot(data.payload, `히스토리 스냅샷 ${data.id as string}`),
  };
}

const EMPTY_MACRO_RESEARCH: MacroResearchPayload = {
  economicEvents: [],
  energy: [],
  positioning: [],
  statuses: [],
  warnings: [],
};

const EMPTY_MARKET_RESEARCH: MarketResearchPayload = {
  portfolioPrices: [],
  secFilings: [],
  fundamentals: [],
  earningsEvents: [],
  marketCapitalization: null,
  statuses: [],
  warnings: [],
};

function researchPayload<T extends object>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...fallback, ...value } as T : fallback;
}

export async function getInvestorResearchState(): Promise<InvestorResearchState> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { migrationReady: false, macro: EMPTY_MACRO_RESEARCH, market: EMPTY_MARKET_RESEARCH };
  const { data, error } = await supabase
    .from("investor_research_state")
    .select("macro_payload, market_payload")
    .eq("id", "primary")
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { migrationReady: false, macro: EMPTY_MACRO_RESEARCH, market: EMPTY_MARKET_RESEARCH };
    }
    throw new Error(`투자 리서치 데이터 조회 실패: ${error.message}`);
  }
  return {
    migrationReady: true,
    macro: researchPayload(data?.macro_payload, EMPTY_MACRO_RESEARCH),
    market: researchPayload(data?.market_payload, EMPTY_MARKET_RESEARCH),
  };
}

export async function saveMacroResearchPayload(payload: MacroResearchPayload): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from("investor_research_state").upsert({
    id: "primary",
    macro_payload: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    throw new Error(`매크로 리서치 저장 실패: ${error.message}`);
  }
  return true;
}

export async function saveMarketResearchPayload(payload: MarketResearchPayload): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from("investor_research_state").upsert({
    id: "primary",
    market_payload: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    throw new Error(`시장 리서치 저장 실패: ${error.message}`);
  }
  return true;
}

function mapCompanyProfileSummary(row: Record<string, unknown>): CompanyProfileSummary {
  return {
    ticker: row.ticker as string,
    companyName: (row.company_name as string | null | undefined) ?? (row.ticker as string),
    sector: (row.sector as string | null | undefined) ?? "",
    industry: (row.industry as string | null | undefined) ?? "",
    country: (row.country as string | null | undefined) ?? "",
    financialCheckedAt: (row.financial_checked_at as string | null | undefined) ?? null,
    financialUpdatedAt: (row.financial_updated_at as string | null | undefined) ?? null,
    financialFilingAccession: (row.financial_filing_accession as string | null | undefined) ?? null,
    financialFilingForm: (row.financial_filing_form as string | null | undefined) ?? null,
    financialFilingDate: (row.financial_filing_date as string | null | undefined) ?? null,
    profileAnalyzedAt: (row.profile_analyzed_at as string | null | undefined) ?? null,
    profileModel: (row.profile_model as string | null | undefined) ?? null,
    profilePromptVersion: row.profile_prompt_version === null || row.profile_prompt_version === undefined ? null : Number(row.profile_prompt_version),
    profileSourceFilingDate: (row.profile_source_filing_date as string | null | undefined) ?? null,
    profileError: (row.profile_error as string | null | undefined) ?? null,
  };
}

function mapCompanyProfileRun(row: Record<string, unknown>): CompanyProfileRefreshRun {
  return {
    id: row.id as string,
    mode: row.mode === "single" ? "single" : "bulk",
    requestedTicker: (row.requested_ticker as string | null | undefined) ?? null,
    status: row.status as CompanyProfileRefreshRun["status"],
    stage: row.stage as CompanyProfileRefreshRun["stage"],
    workflowRunId: (row.workflow_run_id as string | null | undefined) ?? null,
    model: row.model as string,
    promptVersion: Number(row.prompt_version ?? 0),
    totalCount: Number(row.total_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    estimatedInputTokens: Number(row.estimated_input_tokens ?? 0),
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null | undefined) ?? null,
    error: (row.error_summary as string | null | undefined) ?? null,
  };
}

const COMPANY_PROFILE_SUMMARY_COLUMNS = "ticker, company_name, sector, industry, country, financial_checked_at, financial_updated_at, financial_filing_accession, financial_filing_form, financial_filing_date, profile_analyzed_at, profile_model, profile_prompt_version, profile_source_filing_date, profile_error";
const COMPANY_PROFILE_RUN_COLUMNS = "id, mode, requested_ticker, status, stage, workflow_run_id, model, prompt_version, total_count, completed_count, failed_count, skipped_count, estimated_input_tokens, started_at, finished_at, error_summary";

export async function getCompanyProfilesState(): Promise<{ migrationReady: boolean; summaries: CompanyProfileSummary[]; latestRun: CompanyProfileRefreshRun | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { migrationReady: false, summaries: [], latestRun: null };
  const [profileResult, runResult] = await Promise.all([
    supabase.from("company_profiles").select(COMPANY_PROFILE_SUMMARY_COLUMNS).order("ticker"),
    supabase.from("company_profile_runs").select(COMPANY_PROFILE_RUN_COLUMNS).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const missing = [profileResult.error, runResult.error].some((error) => error?.code === "42P01" || error?.code === "PGRST205");
  if (missing) return { migrationReady: false, summaries: [], latestRun: null };
  if (profileResult.error) throw new Error(`기업 정보 목록 조회 실패: ${profileResult.error.message}`);
  if (runResult.error) throw new Error(`기업 정보 갱신 상태 조회 실패: ${runResult.error.message}`);
  return {
    migrationReady: true,
    summaries: (profileResult.data ?? []).map((row) => mapCompanyProfileSummary(row)),
    latestRun: runResult.data ? mapCompanyProfileRun(runResult.data) : null,
  };
}

export async function getCompanyProfileDetail(ticker: string): Promise<{ migrationReady: boolean; profile: CompanyProfileDetail | null }> {
  const normalized = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(normalized)) return { migrationReady: true, profile: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { migrationReady: false, profile: null };
  const { data, error } = await supabase.from("company_profiles")
    .select(`${COMPANY_PROFILE_SUMMARY_COLUMNS}, financial_payload, financial_source_url, profile_payload, profile_source_accession, profile_source_url`)
    .eq("ticker", normalized)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { migrationReady: false, profile: null };
    throw new Error(`기업 정보 조회 실패: ${error.message}`);
  }
  if (!data) return { migrationReady: true, profile: null };
  return {
    migrationReady: true,
    profile: {
      ...mapCompanyProfileSummary(data),
      financial: (data.financial_payload as CompanyProfileDetail["financial"] | undefined) ?? null,
      financialSourceUrl: (data.financial_source_url as string | null | undefined) ?? null,
      narrative: (data.profile_payload as CompanyProfileDetail["narrative"] | undefined) ?? null,
      profileSourceAccession: (data.profile_source_accession as string | null | undefined) ?? null,
      profileSourceUrl: (data.profile_source_url as string | null | undefined) ?? null,
    },
  };
}

export async function seedCompanyProfileMetadata(companies: MarketCapitalizationItem[]): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  if (!companies.length) return true;
  const rows = companies.slice(0, 200).map((company) => ({
    ticker: company.symbol,
    company_name: company.name,
    sector: company.sector,
    industry: company.industry,
    country: company.country,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("company_profiles").upsert(rows, { onConflict: "ticker" });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    throw new Error(`기업 정보 기본 데이터 저장 실패: ${error.message}`);
  }
  return true;
}

export async function saveCompanyFinancialBatch(
  companies: MarketCapitalizationItem[],
  results: CompanyFinancialCollection[],
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const tickers = companies.map((company) => company.symbol);
  if (!tickers.length) return true;
  const existingResult = await supabase.from("company_profiles")
    .select("ticker, financial_payload, financial_checked_at, financial_updated_at, financial_filing_accession, financial_filing_form, financial_filing_date, financial_source_url")
    .in("ticker", tickers);
  if (existingResult.error) {
    if (existingResult.error.code === "42P01" || existingResult.error.code === "PGRST205") return false;
    throw new Error(`기존 기업 재무 조회 실패: ${existingResult.error.message}`);
  }
  const existing = new Map((existingResult.data ?? []).map((row) => [row.ticker as string, row]));
  const resultByTicker = new Map(results.map((result) => [result.ticker, result]));
  const now = new Date().toISOString();
  const rows = companies.map((company) => {
    const result = resultByTicker.get(company.symbol);
    const previous = existing.get(company.symbol);
    const nextPayload = result?.financial ?? previous?.financial_payload ?? null;
    const nextAccession = result?.filingAccession ?? previous?.financial_filing_accession ?? null;
    const changed = Boolean(result?.financial) && (
      nextAccession !== (previous?.financial_filing_accession ?? null)
      || JSON.stringify(nextPayload) !== JSON.stringify(previous?.financial_payload ?? null)
    );
    return {
      ticker: company.symbol,
      company_name: result?.companyName || company.name,
      sector: company.sector,
      industry: company.industry,
      country: company.country,
      cik: result?.cik ?? null,
      financial_payload: nextPayload,
      financial_checked_at: result?.checkedAt ?? previous?.financial_checked_at ?? null,
      financial_updated_at: changed ? now : previous?.financial_updated_at ?? (result?.financial ? now : null),
      financial_filing_accession: nextAccession,
      financial_filing_form: result?.filingForm ?? previous?.financial_filing_form ?? null,
      financial_filing_date: result?.filingDate ?? previous?.financial_filing_date ?? null,
      financial_source_url: result?.sourceUrl ?? previous?.financial_source_url ?? null,
      updated_at: now,
    };
  });
  const { error } = await supabase.from("company_profiles").upsert(rows, { onConflict: "ticker" });
  if (error) throw new Error(`기업 재무 저장 실패: ${error.message}`);
  return true;
}

export async function saveCompanyProfileNarrative(
  company: MarketCapitalizationItem,
  narrative: CompanyProfileNarrative,
  source: { accession: string; filedAt: string; sourceUrl: string },
  model: string,
  promptVersion: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const now = new Date().toISOString();
  const { error } = await supabase.from("company_profiles").upsert({
    ticker: company.symbol,
    company_name: company.name,
    sector: company.sector,
    industry: company.industry,
    country: company.country,
    profile_payload: narrative,
    profile_analyzed_at: now,
    profile_model: model,
    profile_prompt_version: promptVersion,
    profile_source_accession: source.accession,
    profile_source_filing_date: source.filedAt,
    profile_source_url: source.sourceUrl,
    profile_error: null,
    updated_at: now,
  }, { onConflict: "ticker" });
  if (error) throw new Error(`기업 분석 저장 실패: ${error.message}`);
}

export async function saveCompanyProfileError(company: MarketCapitalizationItem, message: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from("company_profiles").upsert({
    ticker: company.symbol,
    company_name: company.name,
    sector: company.sector,
    industry: company.industry,
    country: company.country,
    profile_error: message.slice(0, 1_200),
    updated_at: new Date().toISOString(),
  }, { onConflict: "ticker" });
  if (error) throw new Error(`기업 분석 오류 저장 실패: ${error.message}`);
}

function mapPortfolioItem(row: Record<string, unknown>): PortfolioItem {
  return {
    id: row.id as string,
    ticker: row.ticker as string,
    companyName: (row.company_name as string | null | undefined) ?? "",
    kind: row.kind === "holding" ? "holding" : "watchlist",
    quantity: Number(row.quantity ?? 0),
    averageCost: row.average_cost === null || row.average_cost === undefined ? null : Number(row.average_cost),
    targetWeight: row.target_weight === null || row.target_weight === undefined ? null : Number(row.target_weight),
    sector: (row.sector as string | null | undefined) ?? "",
    currency: row.currency === "KRW" ? "KRW" : "USD",
    thesis: (row.thesis as string | null | undefined) ?? "",
    invalidation: (row.invalidation as string | null | undefined) ?? "",
    notes: (row.notes as string | null | undefined) ?? "",
    enabled: row.enabled !== false,
    position: Number(row.position ?? 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getPortfolioItems(): Promise<{ migrationReady: boolean; items: PortfolioItem[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { migrationReady: false, items: [] };
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("id, ticker, company_name, kind, quantity, average_cost, target_weight, sector, currency, thesis, invalidation, notes, enabled, position, created_at, updated_at")
    .order("position")
    .order("ticker");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { migrationReady: false, items: [] };
    throw new Error(`포트폴리오 조회 실패: ${error.message}`);
  }
  return { migrationReady: true, items: (data ?? []).map((row) => mapPortfolioItem(row)) };
}

export async function recordRefreshMetric(runId: string, component: string, metrics: Record<string, unknown>): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.rpc("record_refresh_metric", {
    p_run_id: runId,
    p_component: component,
    p_metrics: metrics,
  });
  if (error && error.code !== "PGRST202" && error.code !== "42883") {
    throw new Error(`갱신 사용량 저장 실패: ${error.message}`);
  }
}

export async function getRefreshMetrics(limit = 12): Promise<{ migrationReady: boolean; records: RefreshMetricsRecord[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { migrationReady: false, records: [] };
  const { data, error } = await supabase
    .from("refresh_metrics")
    .select("refresh_run_id, metrics, refresh_runs(source, started_at, finished_at)")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(30, Math.trunc(limit))));
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { migrationReady: false, records: [] };
    throw new Error(`갱신 사용량 조회 실패: ${error.message}`);
  }
  return {
    migrationReady: true,
    records: (data ?? []).map((row) => {
      const joined = (Array.isArray(row.refresh_runs) ? row.refresh_runs[0] : row.refresh_runs) as Record<string, unknown> | null;
      return {
        refreshRunId: row.refresh_run_id as string,
        source: joined?.source === "macro" || joined?.source === "market" || joined?.source === "social" || joined?.source === "all" ? joined.source : null,
        startedAt: (joined?.started_at as string | undefined) ?? "",
        finishedAt: (joined?.finished_at as string | null | undefined) ?? null,
        metrics: researchPayload(row.metrics, {}),
      };
    }),
  };
}

function mapComprehensiveAnalysisRun(row: Record<string, unknown>): ComprehensiveAnalysisRunStatus {
  return {
    id: row.id as string,
    snapshotId: (row.snapshot_id as string | null | undefined) ?? null,
    status: row.status as ComprehensiveAnalysisRunStatus["status"],
    stage: row.stage as ComprehensiveAnalysisRunStatus["stage"],
    workflowRunId: (row.workflow_run_id as string | null | undefined) ?? null,
    model: row.model as string,
    estimatedInputTokens: Number(row.estimated_input_tokens ?? 0),
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null | undefined) ?? null,
    error: (row.error_summary as string | null | undefined) ?? null,
  };
}

export interface ComprehensiveAnalysisState {
  migrationReady: boolean;
  latestRun: ComprehensiveAnalysisRunStatus | null;
  latestReport: StoredComprehensiveAnalysis | null;
}

export async function getComprehensiveAnalysisState(): Promise<ComprehensiveAnalysisState> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { migrationReady: false, latestRun: null, latestReport: null };

  const [runResult, reportResult] = await Promise.all([
    supabase
      .from("comprehensive_analysis_runs")
      .select("id, snapshot_id, status, stage, workflow_run_id, model, estimated_input_tokens, started_at, finished_at, error_summary")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("comprehensive_analysis_runs")
      .select("id, snapshot_id, finished_at, report")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const missing = [runResult.error, reportResult.error].some((error) => error?.code === "42P01" || error?.code === "PGRST205");
  if (missing) return { migrationReady: false, latestRun: null, latestReport: null };
  if (runResult.error) throw new Error(`종합분석 상태 조회 실패: ${runResult.error.message}`);
  if (reportResult.error) throw new Error(`종합분석 리포트 조회 실패: ${reportResult.error.message}`);

  return {
    migrationReady: true,
    latestRun: runResult.data ? mapComprehensiveAnalysisRun(runResult.data) : null,
    latestReport: reportResult.data?.report ? {
      id: reportResult.data.id as string,
      snapshotId: (reportResult.data.snapshot_id as string | null | undefined) ?? null,
      createdAt: reportResult.data.finished_at as string,
      report: reportResult.data.report as ComprehensiveAnalysisReport,
    } : null,
  };
}

export interface HistorySettingsResult {
  retentionLimit: number;
  migrationReady: boolean;
}

export async function getHistorySettings(): Promise<HistorySettingsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { retentionLimit: 30, migrationReady: false };

  const { data, error } = await supabase
    .from("dashboard_settings")
    .select("history_retention_limit")
    .eq("id", "primary")
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { retentionLimit: 30, migrationReady: false };
    }
    throw new Error(`히스토리 설정 조회 실패: ${error.message}`);
  }
  return {
    retentionLimit: (data?.history_retention_limit as number | undefined) ?? 30,
    migrationReady: true,
  };
}

export interface XMonitorSettingsResult {
  accounts: XMonitorAccountSetting[];
  usernames: string[];
  lookbackDays: number;
  perAccountPostLimit: number | null;
  totalPostLimit: number | null;
  source: "database" | "environment" | "none";
  accountStatusReady: boolean;
}

export interface XMonitorAccountSetting {
  username: string;
  enabled: boolean;
}

export interface XTickerMonitorSetting {
  ticker: string;
  companyName: string;
  enabled: boolean;
}

export interface XTickerMonitorSettingsResult {
  tickers: XTickerMonitorSetting[];
  activeTickers: XTickerMonitorSetting[];
  lookbackDays: number;
  perTickerPostLimit: number | null;
  totalPostLimit: number | null;
  migrationReady: boolean;
}

function optionalPositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function environmentAccounts(): string[] {
  return (process.env.X_TARGET_USERNAMES ?? "")
    .split(",")
    .map((username) => username.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

function environmentLookbackDays(): number {
  const parsed = Number(process.env.X_LOOKBACK_DAYS ?? 7);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 7;
}

export async function getXMonitorSettings(): Promise<XMonitorSettingsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const usernames = environmentAccounts();
    return {
      accounts: usernames.map((username) => ({ username, enabled: true })),
      usernames,
      lookbackDays: environmentLookbackDays(),
      perAccountPostLimit: optionalPositiveInteger(process.env.X_PER_ACCOUNT_POST_LIMIT),
      totalPostLimit: optionalPositiveInteger(process.env.X_TOTAL_POST_LIMIT),
      source: process.env.X_TARGET_USERNAMES ? "environment" : "none",
      accountStatusReady: false,
    };
  }

  const [fullAccountsResult, settingsResult] = await Promise.all([
    supabase.from("x_monitored_accounts").select("username, enabled").order("position"),
    supabase.from("x_monitor_settings").select("lookback_days, per_account_post_limit, total_post_limit").eq("id", "primary").maybeSingle(),
  ]);

  const statusColumnMissing = fullAccountsResult.error?.code === "42703" || fullAccountsResult.error?.code === "PGRST204";
  const legacyAccountsResult = statusColumnMissing
    ? await supabase.from("x_monitored_accounts").select("username").order("position")
    : null;
  const accountsError = statusColumnMissing ? legacyAccountsResult?.error : fullAccountsResult.error;
  const error = accountsError ?? settingsResult.error;
  if (error) {
    if (error.code === "42P01") {
      const fallback = environmentAccounts();
      return {
        accounts: fallback.map((username) => ({ username, enabled: true })),
        usernames: fallback,
        lookbackDays: environmentLookbackDays(),
        perAccountPostLimit: optionalPositiveInteger(process.env.X_PER_ACCOUNT_POST_LIMIT),
        totalPostLimit: optionalPositiveInteger(process.env.X_TOTAL_POST_LIMIT),
        source: fallback.length ? "environment" : "none",
        accountStatusReady: false,
      };
    }
    throw new Error(`X 모니터링 설정 조회 실패: ${error.message}`);
  }

  const accounts: XMonitorAccountSetting[] = statusColumnMissing
    ? (legacyAccountsResult?.data ?? []).map((row) => ({ username: row.username as string, enabled: true }))
    : (fullAccountsResult.data ?? []).map((row) => ({ username: row.username as string, enabled: row.enabled as boolean }));
  return {
    accounts,
    usernames: accounts.filter((account) => account.enabled).map((account) => account.username),
    lookbackDays: (settingsResult.data?.lookback_days as number | undefined) ?? 7,
    perAccountPostLimit: (settingsResult.data?.per_account_post_limit as number | null | undefined) ?? null,
    totalPostLimit: (settingsResult.data?.total_post_limit as number | null | undefined) ?? null,
    source: "database",
    accountStatusReady: !statusColumnMissing,
  };
}

export async function getXTickerMonitorSettings(): Promise<XTickerMonitorSettingsResult> {
  const fallback: XTickerMonitorSettingsResult = {
    tickers: [],
    activeTickers: [],
    lookbackDays: 1,
    perTickerPostLimit: 20,
    totalPostLimit: 50,
    migrationReady: false,
  };
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallback;

  const [tickersResult, settingsResult] = await Promise.all([
    supabase.from("x_monitored_tickers").select("ticker, company_name, enabled").order("position"),
    supabase.from("x_ticker_monitor_settings").select("lookback_days, per_ticker_post_limit, total_post_limit").eq("id", "primary").maybeSingle(),
  ]);
  const migrationMissing = [tickersResult.error, settingsResult.error].some((error) => error?.code === "42P01" || error?.code === "PGRST205");
  if (migrationMissing) return fallback;
  if (tickersResult.error) throw new Error(`X 티커 설정 조회 실패: ${tickersResult.error.message}`);
  if (settingsResult.error) throw new Error(`X 티커 수집 설정 조회 실패: ${settingsResult.error.message}`);

  const tickers: XTickerMonitorSetting[] = (tickersResult.data ?? []).map((row) => ({
    ticker: row.ticker as string,
    companyName: (row.company_name as string | null | undefined) ?? "",
    enabled: row.enabled as boolean,
  }));
  return {
    tickers,
    activeTickers: tickers.filter((ticker) => ticker.enabled),
    lookbackDays: (settingsResult.data?.lookback_days as number | undefined) ?? 1,
    perTickerPostLimit: (settingsResult.data?.per_ticker_post_limit as number | null | undefined) ?? 20,
    totalPostLimit: (settingsResult.data?.total_post_limit as number | null | undefined) ?? 50,
    migrationReady: true,
  };
}

export function getMissingConfiguration(source?: RefreshSource, socialMode: SocialRefreshMode = "collect_and_analyze"): string[] {
  const required: Array<[string, string | undefined]> = [
    ["SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
  ];
  if (!source || source === "macro" || source === "all") required.push(["FRED_API_KEY", process.env.FRED_API_KEY]);
  if ((!source || source === "market" || source === "all") && !process.env.ALPHA_VANTAGE_API_KEY && !process.env.TWELVE_DATA_API_KEY) {
    required.push(["ALPHA_VANTAGE_API_KEY 또는 TWELVE_DATA_API_KEY", undefined]);
  }
  if (!source || source === "social" || source === "all") {
    if (socialMode !== "analyze_only") required.push(["X_BEARER_TOKEN", process.env.X_BEARER_TOKEN]);
    if (socialMode !== "collect_only") required.push(["OPENAI_API_KEY", process.env.OPENAI_API_KEY]);
  }
  return required.filter(([, value]) => !value).map(([name]) => name);
}
