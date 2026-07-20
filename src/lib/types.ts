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

export type RefreshSource = "macro" | "social";

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
  socialUpdatedAt?: string;
  macro: MacroSeries[];
  social: {
    analysisModel?: string;
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
