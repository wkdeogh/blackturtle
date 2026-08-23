export type Sentiment = "positive" | "neutral" | "negative";

export interface MacroPoint {
  date: string;
  value: number;
}

export interface MacroSeries {
  id: string;
  label: string;
  group: string;
  unit: string;
  decimals: number;
  current: number;
  previous: number | null;
  change: number | null;
  observationDate: string;
  points: MacroPoint[];
}

export interface MarketPoint {
  date: string;
  value: number;
}

export type MarketInstrumentType = "index" | "etf" | "forex" | "crypto";
export type MarketSeriesGroup = "market" | "country";

export interface MarketSeries {
  id: string;
  label: string;
  symbol: string;
  group: MarketSeriesGroup;
  instrumentType: MarketInstrumentType;
  interval: "daily" | "weekly";
  benchmark?: string;
  currency: string;
  decimals: number;
  current: number;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
  observationDate: string;
  peakValue: number;
  peakDate: string;
  drawdownPercent: number;
  points: MarketPoint[];
}

export interface MarketSnapshot {
  provider: "Twelve Data" | "Alpha Vantage";
  peakWindowYears: 3;
  series: MarketSeries[];
  countryEtfs: MarketSeries[];
  warnings: string[];
}

export type RefreshSource = "macro" | "market" | "social" | "all";
export type RefreshTarget = Exclude<RefreshSource, "all">;
export type SocialRefreshMode = "collect_and_analyze" | "collect_only" | "analyze_only";
export type SocialCollectionScope = "accounts" | "tickers" | "all";
export type RefreshRunState = "running" | "success" | "failed";
export type RefreshStage = "queued" | "collecting" | "saving" | "completed" | "failed";

export interface RefreshRunStatus {
  id: string;
  source: RefreshSource | null;
  status: RefreshRunState;
  stage: RefreshStage | null;
  workflowRunId: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface CompanyMention {
  ticker: string;
  name: string;
  sentiment: Sentiment;
  confidence: number;
  evidence: string;
}

export interface SocialPost {
  id: string;
  username: string;
  text: string;
  postedAt: string;
  url: string;
  lang?: string;
  source?: "account" | "ticker";
  matchedTickers?: string[];
  mentions: CompanyMention[];
  translationKo?: string;
  analyzed?: boolean;
}

export interface MentionSummary {
  ticker: string;
  name: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  lastMentionAt: string;
}

export interface TopicSummary {
  title: string;
  summary: string;
  keywords: string[];
  postCount: number;
  postIds: string[];
}

export interface XAccountCursor {
  username: string;
  userId: string;
  newestPostId?: string;
  pendingNewestPostId?: string;
  backfillUntilId?: string;
}

export interface XTickerCursor {
  ticker: string;
  newestPostId?: string;
  pendingNewestPostId?: string;
  backfillUntilId?: string;
}

export interface DashboardSnapshot {
  version: 1;
  generatedAt: string;
  refreshSource?: RefreshSource;
  macroUpdatedAt?: string;
  marketUpdatedAt?: string;
  socialUpdatedAt?: string;
  socialCollectedAt?: string;
  socialAnalyzedAt?: string;
  socialAccountCollectedAt?: string;
  socialAccountAnalyzedAt?: string;
  socialTickerCollectedAt?: string;
  socialTickerAnalyzedAt?: string;
  macroWarnings?: string[];
  macro: MacroSeries[];
  market?: MarketSnapshot;
  social: {
    analysisModel?: string;
    analysisPromptVersion?: string;
    topicModel?: string;
    topicPromptVersion?: string;
    topicSummaryError?: string;
    topicSummaryStale?: boolean;
    topics?: TopicSummary[];
    collectionWarnings?: string[];
    collectionMetrics?: {
      apiCalls: number;
      targetsAttempted: number;
      targetsSucceeded: number;
      targetsFailed: number;
      fetchedPosts: number;
      reusedAnalyses: number;
      pendingAnalyses: number;
    };
    periodDays: number;
    accounts: XAccountCursor[];
    tickerPeriodDays?: number;
    tickers?: XTickerCursor[];
    posts: SocialPost[];
    companies: MentionSummary[];
    analyzedPostCount: number;
  };
}

export type DataFreshnessState = "fresh" | "stale" | "error" | "not_configured";

export interface DataSourceStatus {
  source: string;
  label: string;
  state: DataFreshnessState;
  updatedAt?: string;
  observationDate?: string;
  message?: string;
}

export interface EconomicCalendarEvent {
  id: string;
  date: string;
  name: string;
  category: "inflation" | "employment" | "growth" | "fed" | "other";
  source: "FRED";
}

export interface ResearchTimeSeries {
  id: string;
  label: string;
  unit: string;
  current: number;
  previous: number | null;
  change: number | null;
  observationDate: string;
  points: MacroPoint[];
}

export interface CftcPositioningSeries {
  id: string;
  label: string;
  contractCode: string;
  observationDate: string;
  netNonCommercial: number;
  previousNet: number | null;
  openInterest: number;
  netPercentOfOpenInterest: number | null;
  percentile3Y: number | null;
  points: Array<{ date: string; net: number; openInterest: number }>;
}

export interface MacroResearchPayload {
  updatedAt?: string;
  economicEvents: EconomicCalendarEvent[];
  energy: ResearchTimeSeries[];
  positioning: CftcPositioningSeries[];
  statuses: DataSourceStatus[];
  warnings: string[];
}

export interface PortfolioPrice {
  ticker: string;
  currency: string;
  current: number;
  previous: number | null;
  changePercent: number | null;
  observationDate: string;
  peakValue: number;
  peakDate: string;
  drawdownPercent: number;
  points: MarketPoint[];
}

export interface SecFiling {
  id: string;
  ticker: string;
  companyName: string;
  form: string;
  filedAt: string;
  reportDate?: string;
  primaryDocument: string;
  url: string;
  importance: "high" | "medium" | "low";
}

export interface CompanyFundamentalSnapshot {
  ticker: string;
  companyName: string;
  fiscalYearEnd: string;
  filedAt: string;
  currency: "USD";
  revenue: number | null;
  revenueGrowthPercent: number | null;
  operatingIncome: number | null;
  operatingMarginPercent: number | null;
  netIncome: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  cash: number | null;
  longTermDebt: number | null;
  sourceUrl: string;
}

export interface EarningsCalendarEvent {
  ticker: string;
  companyName?: string;
  reportDate: string;
  fiscalDateEnding?: string;
  estimate?: number | null;
  currency?: string;
  source: "Alpha Vantage";
}

export interface MarketCapitalizationItem {
  rank: number;
  previousRank: number | null;
  rankChange: number | null;
  symbol: string;
  name: string;
  marketCap: number;
  previousMarketCap: number | null;
  marketCapChangePercent: number | null;
  lastPrice: number | null;
  dayChangePercent: number | null;
  sector: string;
  industry: string;
  country: string;
  sourceUrl: string;
}

export interface MarketCapitalizationSnapshot {
  provider: "Nasdaq Screener";
  updatedAt: string;
  universeCount: number;
  items: MarketCapitalizationItem[];
}

export interface CompanyFinancialPeriod {
  periodEnd: string;
  filedAt: string;
  form: string;
  accession: string;
  revenue: number | null;
  operatingIncome: number | null;
  operatingMarginPercent: number | null;
  derived?: boolean;
}

export interface CompanyFinancialPayload {
  currency: string;
  annual: CompanyFinancialPeriod[];
  quarterly: CompanyFinancialPeriod[];
}

export interface CompanyProfileNarrativeItem {
  title: string;
  description: string;
}

export interface CompanyProfileNarrative {
  overview: string;
  revenueItems: CompanyProfileNarrativeItem[];
  growthAndResearch: CompanyProfileNarrativeItem[];
}

export interface CompanyProfileSummary {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  country: string;
  financialCheckedAt: string | null;
  financialUpdatedAt: string | null;
  financialFilingAccession: string | null;
  financialFilingForm: string | null;
  financialFilingDate: string | null;
  profileAnalyzedAt: string | null;
  profileModel: string | null;
  profilePromptVersion: number | null;
  profileSourceFilingDate: string | null;
  profileError: string | null;
}

export interface CompanyProfileDetail extends CompanyProfileSummary {
  financial: CompanyFinancialPayload | null;
  financialSourceUrl: string | null;
  narrative: CompanyProfileNarrative | null;
  profileSourceAccession: string | null;
  profileSourceUrl: string | null;
}

export type CompanyProfileRefreshMode = "bulk" | "single";
export type CompanyProfileRefreshState = "running" | "success" | "partial" | "failed";
export type CompanyProfileRefreshStage = "queued" | "financials" | "analyzing" | "saving" | "completed" | "failed";

export interface CompanyProfileRefreshRun {
  id: string;
  mode: CompanyProfileRefreshMode;
  requestedTicker: string | null;
  status: CompanyProfileRefreshState;
  stage: CompanyProfileRefreshStage;
  workflowRunId: string | null;
  model: string;
  promptVersion: number;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  estimatedInputTokens: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface MarketResearchPayload {
  updatedAt?: string;
  portfolioPrices: PortfolioPrice[];
  secFilings: SecFiling[];
  fundamentals: CompanyFundamentalSnapshot[];
  earningsEvents: EarningsCalendarEvent[];
  marketCapitalization: MarketCapitalizationSnapshot | null;
  statuses: DataSourceStatus[];
  warnings: string[];
}

export interface InvestorResearchState {
  migrationReady: boolean;
  macro: MacroResearchPayload;
  market: MarketResearchPayload;
}

export type PortfolioItemKind = "holding" | "watchlist";

export interface PortfolioItem {
  id: string;
  ticker: string;
  companyName: string;
  kind: PortfolioItemKind;
  quantity: number;
  averageCost: number | null;
  targetWeight: number | null;
  sector: string;
  currency: "USD" | "KRW";
  thesis: string;
  invalidation: string;
  notes: string;
  enabled: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshMetricsRecord {
  refreshRunId: string;
  source: RefreshSource | null;
  startedAt: string;
  finishedAt: string | null;
  metrics: Record<string, unknown>;
}

export interface StoredSnapshot {
  id: string;
  createdAt: string;
  payload: DashboardSnapshot;
}

export type ComprehensiveAnalysisRunState = "running" | "success" | "failed";
export type ComprehensiveAnalysisStage = "queued" | "analyzing" | "saving" | "completed" | "failed";
export type AnalysisConfidence = "높음" | "보통" | "낮음";

export interface ComprehensiveAnalysisRunStatus {
  id: string;
  snapshotId: string | null;
  status: ComprehensiveAnalysisRunState;
  stage: ComprehensiveAnalysisStage;
  workflowRunId: string | null;
  model: string;
  estimatedInputTokens: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

interface ComprehensiveAnalysisReportMetadata {
  generatedAt: string;
  sourceSnapshotId: string;
  sourceSnapshotGeneratedAt: string;
  model: string;
  estimatedInputTokens: number;
}

export interface MarkdownComprehensiveAnalysisReport extends ComprehensiveAnalysisReportMetadata {
  version: 2;
  markdown: string;
}

export interface LegacyComprehensiveAnalysisReport extends ComprehensiveAnalysisReportMetadata {
  version: 1;
  headline: string;
  executiveSummary: string;
  marketRegime: {
    label: string;
    summary: string;
    evidence: string[];
  };
  keyInsights: Array<{
    title: string;
    analysis: string;
    evidence: string[];
    investorImplication: string;
    confidence: AnalysisConfidence;
  }>;
  opportunities: Array<{
    title: string;
    rationale: string;
    conditions: string[];
    risks: string[];
    relatedAssets: string[];
  }>;
  risks: Array<{
    title: string;
    transmission: string;
    watchSignals: string[];
    relatedAssets: string[];
  }>;
  scenarios: Array<{
    name: string;
    conditions: string[];
    marketImpact: string;
    response: string;
  }>;
  watchlist: Array<{
    item: string;
    currentContext: string;
    whyItMatters: string;
    trigger: string;
  }>;
  dataCaveats: string[];
  bottomLine: string;
}

export type ComprehensiveAnalysisReport = MarkdownComprehensiveAnalysisReport | LegacyComprehensiveAnalysisReport;

export interface StoredComprehensiveAnalysis {
  id: string;
  snapshotId: string | null;
  createdAt: string;
  report: ComprehensiveAnalysisReport;
}
