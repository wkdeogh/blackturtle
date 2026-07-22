import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { buildMarketSeries, MARKET_DEFINITIONS, type MarketBatchResult, type MarketDefinition } from "@/lib/market-data";
import type { MarketPoint, MarketSeries } from "@/lib/types";

const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";

type AlphaVantageResponse = Record<string, unknown>;

function requestParams(definition: MarketDefinition, apiKey: string): URLSearchParams {
  if (definition.instrumentType === "forex") {
    return new URLSearchParams({ function: "FX_WEEKLY", from_symbol: "USD", to_symbol: "KRW", apikey: apiKey });
  }
  if (definition.instrumentType === "crypto") {
    return new URLSearchParams({ function: "DIGITAL_CURRENCY_WEEKLY", symbol: "BTC", market: "USD", apikey: apiKey });
  }
  return new URLSearchParams({ function: "TIME_SERIES_WEEKLY", symbol: definition.symbol, apikey: apiKey });
}

function responseError(body: AlphaVantageResponse): string | null {
  for (const key of ["Error Message", "Information", "Note"] as const) {
    if (typeof body[key] === "string" && body[key].trim()) return body[key].trim();
  }
  return null;
}

function closeValue(row: Record<string, unknown>, currency: string): number | null {
  const entries = Object.entries(row);
  const currencyMatch = entries.find(([key]) => key.toLowerCase().includes("close") && key.includes(`(${currency})`));
  const genericMatch = entries.find(([key]) => /^4\.?\s/.test(key) && key.toLowerCase().includes("close"))
    ?? entries.find(([key]) => key.toLowerCase().includes("close"));
  const value = Number((currencyMatch ?? genericMatch)?.[1]);
  return Number.isFinite(value) ? value : null;
}

function parseWeeklySeries(definition: MarketDefinition, body: AlphaVantageResponse): MarketSeries {
  const error = responseError(body);
  if (error) throw new Error(error);
  const seriesEntry = Object.entries(body).find(([key, value]) => key.toLowerCase().includes("time series") && value && typeof value === "object");
  if (!seriesEntry || !seriesEntry[1] || typeof seriesEntry[1] !== "object") throw new Error("주간 시계열을 찾지 못했습니다.");

  const points: MarketPoint[] = [];
  for (const [date, rawRow] of Object.entries(seriesEntry[1] as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !rawRow || typeof rawRow !== "object") continue;
    const value = closeValue(rawRow as Record<string, unknown>, definition.currency);
    if (value !== null) points.push({ date, value });
  }
  points.sort((left, right) => left.date.localeCompare(right.date));
  return buildMarketSeries(definition, points, "weekly");
}

async function collectOne(definition: MarketDefinition, apiKey: string): Promise<MarketSeries> {
  const response = await fetchWithTimeout(`${ALPHA_VANTAGE_URL}?${requestParams(definition, apiKey)}`, {
    cache: "no-store",
  }, 40_000, `Alpha Vantage ${definition.label}`);
  const body = await response.json() as AlphaVantageResponse;
  if (!response.ok) throw new Error(responseError(body) ?? response.statusText);
  return parseWeeklySeries(definition, body);
}

export async function collectAlphaVantageMarketBatch(apiKey: string, definitionIds: string[]): Promise<MarketBatchResult> {
  const definitions = definitionIds
    .map((id) => MARKET_DEFINITIONS.find((definition) => definition.id === id))
    .filter((definition): definition is MarketDefinition => Boolean(definition));
  const settled = await Promise.allSettled(definitions.map((definition) => collectOne(definition, apiKey)));
  const series: MarketSeries[] = [];
  const warnings: string[] = [];
  settled.forEach((result, index) => {
    const definition = definitions[index];
    if (result.status === "fulfilled") series.push(result.value);
    else warnings.push(`${definition.label} (${definition.symbol}): ${result.reason instanceof Error ? result.reason.message : "알 수 없는 오류"}`.slice(0, 240));
  });
  if (definitions.length && !series.length) throw new Error(warnings.join(" · ") || "수집된 시장 데이터가 없습니다.");
  return { provider: "Alpha Vantage", series, warnings };
}
