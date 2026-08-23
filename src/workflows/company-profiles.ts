import { sleep } from "workflow";
import { analyzeCompanyProfile, COMPANY_PROFILE_PROMPT_VERSION } from "@/lib/company-profile-analysis";
import { fetchCompanyFinancials, fetchCompanyNarrativeSource, resolveSecCompanyIdentities, type SecCompanyIdentity } from "@/lib/company-financials";
import { refreshErrorMessage } from "@/lib/refresh-runner";
import { getCompanyProfileDetail, getCompanyProfilesState, getInvestorResearchState, getSupabaseAdmin, recordRefreshMetric, saveCompanyFinancialBatch, saveCompanyProfileError, saveCompanyProfileNarrative, seedCompanyProfileMetadata } from "@/lib/supabase";
import type { MarketCapitalizationItem } from "@/lib/types";

export const COMPANY_PROFILE_STALE_DAYS = 60;
const FINANCIAL_BATCH_SIZE = 8;
const ANALYSIS_BATCH_SIZE = 3;

export function isCompanyProfileDue(
  analyzedAt: string | null,
  promptVersion: number | null,
  analyzedModel: string | null,
  targetModel: string,
  now = Date.now(),
): boolean {
  if (!analyzedAt || promptVersion !== COMPANY_PROFILE_PROMPT_VERSION || analyzedModel !== targetModel) return true;
  const analyzedTime = Date.parse(analyzedAt);
  return !Number.isFinite(analyzedTime) || now - analyzedTime >= COMPANY_PROFILE_STALE_DAYS * 86_400_000;
}

async function loadUniverse(): Promise<MarketCapitalizationItem[]> {
  "use step";
  const research = await getInvestorResearchState();
  const companies = research.market.marketCapitalization?.items.slice(0, 200) ?? [];
  if (!companies.length) throw new Error("시가총액 TOP200 데이터가 없습니다. 시장지수를 먼저 갱신하세요.");
  return companies;
}

async function prepareCompanyStorage(companies: MarketCapitalizationItem[]): Promise<boolean> {
  "use step";
  return seedCompanyProfileMetadata(companies);
}

async function resolveCompanyIdentities(companies: MarketCapitalizationItem[]): Promise<SecCompanyIdentity[]> {
  "use step";
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) throw new Error("설정되지 않은 환경 변수: SEC_USER_AGENT");
  return resolveSecCompanyIdentities(companies.map((company) => company.symbol), userAgent);
}

async function collectAndSaveFinancialBatch(
  companies: MarketCapitalizationItem[],
  identities: SecCompanyIdentity[],
): Promise<{ completed: number; failed: number; warnings: string[] }> {
  "use step";
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) throw new Error("설정되지 않은 환경 변수: SEC_USER_AGENT");
  const identityByTicker = new Map(identities.map((identity) => [identity.ticker, identity]));
  const settled = await Promise.allSettled(companies.map(async (company) => {
    const identity = identityByTicker.get(company.symbol);
    if (!identity) throw new Error(`${company.symbol}: SEC CIK를 찾지 못했습니다.`);
    return fetchCompanyFinancials(identity, userAgent);
  }));
  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  await saveCompanyFinancialBatch(companies, results);
  const warnings = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${companies[index]?.symbol ?? "UNKNOWN"}: ${refreshErrorMessage(result.reason)}`]
    : []);
  return { completed: results.length, failed: warnings.length, warnings };
}

collectAndSaveFinancialBatch.maxRetries = 1;

async function recordFinancialMetrics(runId: string, metrics: Record<string, unknown>) {
  "use step";
  await recordRefreshMetric(runId, "company_financials", metrics);
}

export async function syncTopCompanyFinancials(refreshRunId?: string, onlyTickers?: string[]) {
  const universe = await loadUniverse();
  const requested = onlyTickers?.length ? new Set(onlyTickers.map((ticker) => ticker.toUpperCase())) : null;
  const companies = requested ? universe.filter((company) => requested.has(company.symbol)) : universe;
  const migrationReady = await prepareCompanyStorage(universe);
  if (!migrationReady) {
    if (refreshRunId) await recordFinancialMetrics(refreshRunId, { migrationReady: false, requested: companies.length, completed: 0, failed: 0 });
    return { migrationReady: false, requested: companies.length, completed: 0, failed: 0, warnings: ["202608230015_company_profiles.sql migration이 필요합니다."] };
  }
  const identities = await resolveCompanyIdentities(companies);
  let completed = 0;
  let failed = 0;
  const warnings: string[] = [];
  for (let index = 0; index < companies.length; index += FINANCIAL_BATCH_SIZE) {
    const result = await collectAndSaveFinancialBatch(companies.slice(index, index + FINANCIAL_BATCH_SIZE), identities);
    completed += result.completed;
    failed += result.failed;
    warnings.push(...result.warnings);
    if (index + FINANCIAL_BATCH_SIZE < companies.length) await sleep("1s");
  }
  if (refreshRunId) await recordFinancialMetrics(refreshRunId, {
    migrationReady: true,
    requested: companies.length,
    completed,
    failed,
    warnings: warnings.slice(0, 20),
  });
  return { migrationReady: true, requested: companies.length, completed, failed, warnings };
}

async function setRunProgress(runId: string, stage: "financials" | "analyzing" | "saving", completed: number, failed: number) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { error } = await supabase.rpc("set_company_profile_progress", {
    p_run_id: runId,
    p_stage: stage,
    p_completed_count: completed,
    p_failed_count: failed,
  });
  if (error) throw new Error(`기업 분석 진행 상태 저장 실패: ${error.message}`);
}

async function analyzeCompanyBatch(
  companies: MarketCapitalizationItem[],
  identities: SecCompanyIdentity[],
  model: string,
): Promise<{ completed: number; failed: number; errors: string[] }> {
  "use step";
  const apiKey = process.env.OPENAI_API_KEY;
  const userAgent = process.env.SEC_USER_AGENT;
  if (!apiKey) throw new Error("설정되지 않은 환경 변수: OPENAI_API_KEY");
  if (!userAgent) throw new Error("설정되지 않은 환경 변수: SEC_USER_AGENT");
  const identityByTicker = new Map(identities.map((identity) => [identity.ticker, identity]));
  const settled = await Promise.allSettled(companies.map(async (company) => {
    const identity = identityByTicker.get(company.symbol);
    if (!identity) throw new Error(`${company.symbol}: SEC CIK를 찾지 못했습니다.`);
    const [profile, source] = await Promise.all([
      getCompanyProfileDetail(company.symbol),
      fetchCompanyNarrativeSource(identity, userAgent),
    ]);
    const narrative = await analyzeCompanyProfile(company, profile.profile?.financial ?? null, source, apiKey, model);
    await saveCompanyProfileNarrative(company, narrative, source, model, COMPANY_PROFILE_PROMPT_VERSION);
    return company.symbol;
  }));
  const errors: string[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    if (result.status === "fulfilled") continue;
    const company = companies[index];
    const message = `${company.symbol}: ${refreshErrorMessage(result.reason)}`;
    errors.push(message);
    await saveCompanyProfileError(company, message);
  }
  return { completed: settled.length - errors.length, failed: errors.length, errors };
}

// 유료 호출은 응답 유실 뒤 자동 반복하면 중복 과금될 수 있으므로 Workflow 재시도를 막는다.
analyzeCompanyBatch.maxRetries = 0;

async function completeRun(runId: string, completed: number, failed: number, errors: string[]) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.rpc("complete_company_profile_run", {
    p_run_id: runId,
    p_completed_count: completed,
    p_failed_count: failed,
    p_error: errors.slice(0, 12).join("\n"),
  });
}

async function failRun(runId: string, message: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.rpc("fail_company_profile_run", { p_run_id: runId, p_error: message });
}

export async function companyProfileWorkflow(runId: string, tickers: string[], model: string, mode: "bulk" | "single") {
  "use workflow";
  try {
    await setRunProgress(runId, "financials", 0, 0);
    await syncTopCompanyFinancials(undefined, mode === "single" ? tickers : undefined);
    const universe = await loadUniverse();
    const tickerSet = new Set(tickers);
    const companies = universe.filter((company) => tickerSet.has(company.symbol));
    if (!companies.length) throw new Error("분석할 기업을 시가총액 목록에서 찾지 못했습니다.");
    const identities = await resolveCompanyIdentities(companies);
    let completed = 0;
    let failed = 0;
    const errors: string[] = [];
    await setRunProgress(runId, "analyzing", completed, failed);
    for (let index = 0; index < companies.length; index += ANALYSIS_BATCH_SIZE) {
      const result = await analyzeCompanyBatch(companies.slice(index, index + ANALYSIS_BATCH_SIZE), identities, model);
      completed += result.completed;
      failed += result.failed;
      errors.push(...result.errors);
      await setRunProgress(runId, "analyzing", completed, failed);
    }
    await setRunProgress(runId, "saving", completed, failed);
    await completeRun(runId, completed, failed, errors);
    return { ok: true, completed, failed };
  } catch (error) {
    const message = refreshErrorMessage(error);
    await failRun(runId, message);
    return { ok: false, error: message };
  }
}

export async function getCompanyProfileRefreshPreview(ticker?: string, targetModel = "") {
  const [research, state] = await Promise.all([getInvestorResearchState(), getCompanyProfilesState()]);
  if (!state.migrationReady) throw new Error("COMPANY_PROFILE_MIGRATION_REQUIRED");
  const universe = research.market.marketCapitalization?.items.slice(0, 200) ?? [];
  if (!universe.length) throw new Error("시가총액 TOP200 데이터가 없습니다. 시장지수를 먼저 갱신하세요.");
  const summaryByTicker = new Map(state.summaries.map((summary) => [summary.ticker, summary]));
  const requested = ticker ? universe.filter((company) => company.symbol === ticker.toUpperCase()) : universe;
  if (ticker && !requested.length) throw new Error("시가총액 TOP200에서 해당 기업을 찾지 못했습니다.");
  const candidates = ticker ? requested : requested.filter((company) => {
    const summary = summaryByTicker.get(company.symbol);
    return isCompanyProfileDue(
      summary?.profileAnalyzedAt ?? null,
      summary?.profilePromptVersion ?? null,
      summary?.profileModel ?? null,
      targetModel,
    );
  });
  return {
    universe,
    candidates,
    skippedCount: requested.length - candidates.length,
    newCount: candidates.filter((company) => !summaryByTicker.get(company.symbol)?.profileAnalyzedAt).length,
    staleCount: candidates.filter((company) => Boolean(summaryByTicker.get(company.symbol)?.profileAnalyzedAt)).length,
  };
}
