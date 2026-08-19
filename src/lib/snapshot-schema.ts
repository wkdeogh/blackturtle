import { z } from "zod";
import type { DashboardSnapshot } from "@/lib/types";

const pointSchema = z.object({
  date: z.string().min(1),
  value: z.number().finite(),
}).passthrough();

const macroSeriesSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  group: z.string(),
  unit: z.string(),
  decimals: z.number().int().min(0).max(8),
  current: z.number().finite(),
  previous: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  observationDate: z.string().min(1),
  points: z.array(pointSchema),
}).passthrough();

const marketSeriesSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  symbol: z.string(),
  group: z.enum(["market", "country"]),
  instrumentType: z.enum(["index", "etf", "forex", "crypto"]),
  interval: z.enum(["daily", "weekly"]),
  benchmark: z.string().optional(),
  currency: z.string(),
  decimals: z.number().int().min(0).max(8),
  current: z.number().finite(),
  previous: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  changePercent: z.number().finite().nullable(),
  observationDate: z.string().min(1),
  peakValue: z.number().finite(),
  peakDate: z.string().min(1),
  drawdownPercent: z.number().finite(),
  points: z.array(pointSchema),
}).passthrough();

const mentionSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
}).passthrough();

const postSchema = z.object({
  id: z.string(),
  username: z.string(),
  text: z.string(),
  postedAt: z.string(),
  url: z.string(),
  lang: z.string().optional(),
  source: z.enum(["account", "ticker"]).optional(),
  matchedTickers: z.array(z.string()).optional(),
  mentions: z.array(mentionSchema),
  translationKo: z.string().optional(),
  analyzed: z.boolean().optional(),
}).passthrough();

const cursorFields = {
  newestPostId: z.string().optional(),
  pendingNewestPostId: z.string().optional(),
  backfillUntilId: z.string().optional(),
};

const snapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().min(1),
  refreshSource: z.enum(["macro", "market", "social", "all"]).optional(),
  macroUpdatedAt: z.string().optional(),
  marketUpdatedAt: z.string().optional(),
  socialUpdatedAt: z.string().optional(),
  socialCollectedAt: z.string().optional(),
  socialAnalyzedAt: z.string().optional(),
  socialAccountCollectedAt: z.string().optional(),
  socialAccountAnalyzedAt: z.string().optional(),
  socialTickerCollectedAt: z.string().optional(),
  socialTickerAnalyzedAt: z.string().optional(),
  macroWarnings: z.array(z.string()).optional(),
  macro: z.array(macroSeriesSchema),
  market: z.object({
    provider: z.enum(["Twelve Data", "Alpha Vantage"]),
    peakWindowYears: z.literal(3),
    series: z.array(marketSeriesSchema),
    countryEtfs: z.array(marketSeriesSchema),
    warnings: z.array(z.string()),
  }).passthrough().optional(),
  social: z.object({
    analysisModel: z.string().optional(),
    analysisPromptVersion: z.string().optional(),
    topicModel: z.string().optional(),
    topicPromptVersion: z.string().optional(),
    topicSummaryError: z.string().optional(),
    topicSummaryStale: z.boolean().optional(),
    collectionWarnings: z.array(z.string()).optional(),
    collectionMetrics: z.object({
      apiCalls: z.number().int().nonnegative(),
      targetsAttempted: z.number().int().nonnegative(),
      targetsSucceeded: z.number().int().nonnegative(),
      targetsFailed: z.number().int().nonnegative(),
      fetchedPosts: z.number().int().nonnegative(),
      reusedAnalyses: z.number().int().nonnegative(),
      pendingAnalyses: z.number().int().nonnegative(),
    }).passthrough().optional(),
    topics: z.array(z.object({
      title: z.string(),
      summary: z.string(),
      keywords: z.array(z.string()),
      postCount: z.number().int().nonnegative(),
      postIds: z.array(z.string()),
    }).passthrough()).optional(),
    periodDays: z.number().int().positive(),
    accounts: z.array(z.object({
      username: z.string(),
      userId: z.string(),
      ...cursorFields,
    }).passthrough()),
    tickerPeriodDays: z.number().int().positive().optional(),
    tickers: z.array(z.object({
      ticker: z.string(),
      ...cursorFields,
    }).passthrough()).optional(),
    posts: z.array(postSchema),
    companies: z.array(z.object({
      ticker: z.string(),
      name: z.string(),
      total: z.number().int().nonnegative(),
      positive: z.number().int().nonnegative(),
      neutral: z.number().int().nonnegative(),
      negative: z.number().int().nonnegative(),
      lastMentionAt: z.string(),
    }).passthrough()),
    analyzedPostCount: z.number().int().nonnegative(),
  }).passthrough(),
}).passthrough();

export function parseDashboardSnapshot(value: unknown, label = "대시보드 스냅샷"): DashboardSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (parsed.success) return parsed.data as DashboardSnapshot;
  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "root";
  throw new Error(`${label} 형식이 올바르지 않습니다 (${path}: ${issue?.message ?? "검증 실패"}).`);
}
