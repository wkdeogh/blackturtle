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
}

export interface XTickerCursor {
  ticker: string;
  newestPostId?: string;
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
    topicModel?: string;
    topicSummaryError?: string;
    topicSummaryStale?: boolean;
    topics?: TopicSummary[];
    periodDays: number;
    accounts: XAccountCursor[];
    tickerPeriodDays?: number;
    tickers?: XTickerCursor[];
    posts: SocialPost[];
    companies: MentionSummary[];
    analyzedPostCount: number;
  };
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
