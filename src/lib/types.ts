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

export type RefreshSource = "macro" | "market" | "social";
export type SocialRefreshMode = "collect_and_analyze" | "collect_only" | "analyze_only";
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

export interface DashboardSnapshot {
  version: 1;
  generatedAt: string;
  refreshSource?: RefreshSource;
  macroUpdatedAt?: string;
  marketUpdatedAt?: string;
  socialUpdatedAt?: string;
  socialCollectedAt?: string;
  socialAnalyzedAt?: string;
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
