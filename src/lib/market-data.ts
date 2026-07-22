import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { MarketInstrumentType, MarketSeries, MarketSeriesGroup } from "@/lib/types";

const TWELVE_DATA_TIME_SERIES_URL = "https://api.twelvedata.com/time_series";
const MARKET_OUTPUT_SIZE = 1200;

interface MarketDefinition {
  id: string;
  label: string;
  symbol: string;
  group: MarketSeriesGroup;
  instrumentType: MarketInstrumentType;
  currency: string;
  decimals: number;
  benchmark?: string;
}

interface TwelveDataPoint {
  datetime?: string;
  close?: string;
}

interface TwelveDataSeriesResponse {
  code?: number;
  message?: string;
  status?: string;
  values?: TwelveDataPoint[];
}

export interface MarketBatchResult {
  series: MarketSeries[];
  warnings: string[];
}

export const MARKET_DEFINITIONS: readonly MarketDefinition[] = [
  { id: "sp500", label: "S&P 500", symbol: "SPY", group: "market", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "S&P 500 ETF 대용" },
  { id: "nasdaq", label: "나스닥", symbol: "QQQ", group: "market", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "Nasdaq-100 ETF 대용" },
  { id: "gold", label: "금", symbol: "GLD", group: "market", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "금 현물 추종 ETF" },
  { id: "bitcoin", label: "비트코인", symbol: "BTC/USD", group: "market", instrumentType: "crypto", currency: "USD", decimals: 0 },
  { id: "usdkrw", label: "원·달러 환율", symbol: "USD/KRW", group: "market", instrumentType: "forex", currency: "KRW", decimals: 2 },
  { id: "kospi", label: "코스피", symbol: "EWY", group: "market", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "MSCI 한국 ETF 대용" },
  { id: "sox", label: "필라델피아 반도체", symbol: "SOXX", group: "market", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "미국 반도체 ETF 대용" },
  { id: "brazil", label: "브라질", symbol: "EWZ", group: "country", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "MSCI Brazil ETF" },
  { id: "india", label: "인도", symbol: "INDA", group: "country", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "MSCI India ETF" },
  { id: "vietnam", label: "베트남", symbol: "VNM", group: "country", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "Vietnam ETF" },
  { id: "japan", label: "일본", symbol: "EWJ", group: "country", instrumentType: "etf", currency: "USD", decimals: 2, benchmark: "MSCI Japan ETF" },
];

export const MARKET_PRIMARY_IDS = MARKET_DEFINITIONS.slice(0, 7).map((definition) => definition.id);
export const MARKET_COUNTRY_IDS = MARKET_DEFINITIONS.slice(7).map((definition) => definition.id);

function readSeriesPayload(payload: unknown, definition: MarketDefinition, batchSize: number): TwelveDataSeriesResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (batchSize === 1 && (Array.isArray(root.values) || root.status === "error")) return root as TwelveDataSeriesResponse;
  const direct = root[definition.symbol];
  if (direct && typeof direct === "object") return direct as TwelveDataSeriesResponse;

  const matchingEntry = Object.entries(root).find(([key]) => key.toUpperCase() === definition.symbol.toUpperCase());
  return matchingEntry?.[1] && typeof matchingEntry[1] === "object"
    ? matchingEntry[1] as TwelveDataSeriesResponse
    : null;
}

function buildMarketSeries(definition: MarketDefinition, body: TwelveDataSeriesResponse): MarketSeries {
  if (body.status === "error" || !Array.isArray(body.values)) {
    throw new Error(body.message ?? "시계열을 받지 못했습니다.");
  }

  const byDate = new Map<string, number>();
  for (const point of body.values) {
    const date = point.datetime?.slice(0, 10);
    const value = Number(point.close);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    byDate.set(date, value);
  }
  const allPoints = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (allPoints.length < 2) throw new Error("유효한 일간 종가가 부족합니다.");

  const last = allPoints.at(-1)!;
  const cutoff = new Date(`${last.date}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const points = allPoints.filter((point) => point.date >= cutoffDate);
  const current = points.at(-1)!;
  const previous = points.at(-2)?.value ?? null;
  const peak = points.reduce((best, point) => point.value > best.value ? point : best, points[0]);
  const change = previous === null ? null : current.value - previous;

  return {
    id: definition.id,
    label: definition.label,
    symbol: definition.symbol,
    group: definition.group,
    instrumentType: definition.instrumentType,
    benchmark: definition.benchmark,
    currency: definition.currency,
    decimals: definition.decimals,
    current: current.value,
    previous,
    change,
    changePercent: previous === null || previous === 0 ? null : (change! / previous) * 100,
    observationDate: current.date,
    peakValue: peak.value,
    peakDate: peak.date,
    drawdownPercent: peak.value === 0 ? 0 : ((current.value / peak.value) - 1) * 100,
    points,
  };
}

export async function collectMarketBatch(apiKey: string, definitionIds: string[]): Promise<MarketBatchResult> {
  const definitions = definitionIds
    .map((id) => MARKET_DEFINITIONS.find((definition) => definition.id === id))
    .filter((definition): definition is MarketDefinition => Boolean(definition));
  if (!definitions.length) return { series: [], warnings: [] };

  const params = new URLSearchParams({
    symbol: definitions.map((definition) => definition.symbol).join(","),
    interval: "1day",
    outputsize: String(MARKET_OUTPUT_SIZE),
    order: "ASC",
    timezone: "UTC",
    format: "JSON",
  });
  const response = await fetchWithTimeout(`${TWELVE_DATA_TIME_SERIES_URL}?${params}`, {
    cache: "no-store",
    headers: { Authorization: `apikey ${apiKey}` },
  }, 45_000, "Twelve Data 시장지수");
  const payload = await response.json() as unknown;
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as TwelveDataSeriesResponse : null;
    throw new Error(`Twelve Data: ${body?.message ?? response.statusText}`);
  }

  const series: MarketSeries[] = [];
  const warnings: string[] = [];
  for (const definition of definitions) {
    const body = readSeriesPayload(payload, definition, definitions.length);
    try {
      if (!body) throw new Error("응답에서 심볼을 찾지 못했습니다.");
      series.push(buildMarketSeries(definition, body));
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      warnings.push(`${definition.label} (${definition.symbol}): ${message}`.slice(0, 240));
    }
  }
  if (!series.length) throw new Error(warnings.join(" · ") || "수집된 시장 데이터가 없습니다.");
  return { series, warnings };
}
