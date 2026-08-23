import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { MarketCapitalizationItem, MarketCapitalizationSnapshot } from "@/lib/types";

interface NasdaqScreenerRow {
  symbol?: string;
  name?: string;
  lastsale?: string;
  pctchange?: string;
  marketCap?: string;
  country?: string;
  sector?: string;
  industry?: string;
  url?: string;
}

interface NasdaqScreenerResponse {
  data?: {
    rows?: NasdaqScreenerRow[];
  };
  message?: string | null;
  status?: { rCode?: number; developerMessage?: string | null };
}

const ENDPOINT = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true";
const EXCLUDED_SECURITY = /\b(?:warrant|warrants|unit|units|right|rights|preferred|preference|depositary shares? representing preferred|closed[- ]end fund)\b/i;

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[$,%+\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+(?:Class\s+[A-Z0-9]+\s+)?(?:Common Stock|Ordinary Shares?|Common Shares?|Capital Stock)\b.*$/i, "")
    .replace(/\s+American Depositary Shares?\b.*$/i, "")
    .trim();
}

function issuerKey(value: string): string {
  return cleanCompanyName(value)
    .replace(/\bClass\s+[A-Z0-9]+\b/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function validSecurity(row: NasdaqScreenerRow): boolean {
  const symbol = row.symbol?.trim().toUpperCase() ?? "";
  const name = row.name?.trim() ?? "";
  const marketCap = numberValue(row.marketCap);
  return /^[A-Z][A-Z0-9./-]{0,14}$/.test(symbol)
    && Boolean(name)
    && !EXCLUDED_SECURITY.test(name)
    && marketCap !== null
    && marketCap > 0;
}

export function parseNasdaqMarketCapRows(
  rows: NasdaqScreenerRow[],
  previous: MarketCapitalizationSnapshot | null,
  updatedAt: string,
): MarketCapitalizationSnapshot {
  const previousBySymbol = new Map((previous?.items ?? []).map((item) => [item.symbol, item]));
  const unique = new Map<string, NasdaqScreenerRow>();
  for (const row of rows) {
    if (!validSecurity(row)) continue;
    const key = issuerKey(row.name!) || row.symbol!.trim().toLowerCase();
    const stored = unique.get(key);
    if (!stored || (numberValue(row.marketCap) ?? 0) > (numberValue(stored.marketCap) ?? 0)) unique.set(key, row);
  }

  const ranked = [...unique.values()]
    .sort((left, right) => (numberValue(right.marketCap) ?? 0) - (numberValue(left.marketCap) ?? 0) || (left.symbol ?? "").localeCompare(right.symbol ?? ""))
    .slice(0, 200);

  const items: MarketCapitalizationItem[] = ranked.map((row, index) => {
    const symbol = row.symbol!.trim().toUpperCase();
    const marketCap = numberValue(row.marketCap)!;
    const old = previousBySymbol.get(symbol);
    return {
      rank: index + 1,
      previousRank: old?.rank ?? null,
      rankChange: old ? old.rank - (index + 1) : null,
      symbol,
      name: cleanCompanyName(row.name!),
      marketCap,
      previousMarketCap: old?.marketCap ?? null,
      marketCapChangePercent: old?.marketCap ? ((marketCap / old.marketCap) - 1) * 100 : null,
      lastPrice: numberValue(row.lastsale),
      dayChangePercent: numberValue(row.pctchange),
      sector: row.sector?.trim() || "미분류",
      industry: row.industry?.trim() || "",
      country: row.country?.trim() || "",
      sourceUrl: row.url?.startsWith("/") ? `https://www.nasdaq.com${row.url}` : `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase().replaceAll(".", "-")}`,
    };
  });

  if (items.length < 100) throw new Error(`유효한 시가총액 종목이 ${items.length}개뿐입니다.`);
  return { provider: "Nasdaq Screener", updatedAt, universeCount: unique.size, items };
}

export async function collectNasdaqMarketCapitalization(previous: MarketCapitalizationSnapshot | null): Promise<MarketCapitalizationSnapshot> {
  const response = await fetchWithTimeout(ENDPOINT, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; BlackTurtle/1.0; private investment dashboard)",
    },
  }, 45_000, "Nasdaq 시가총액 순위");
  const body = await readJsonResponse<NasdaqScreenerResponse>(response, "Nasdaq 시가총액 순위");
  if (!response.ok || (body.status?.rCode !== undefined && body.status.rCode !== 200)) {
    throw new Error(body.status?.developerMessage || body.message || response.statusText || `HTTP ${response.status}`);
  }
  const rows = body.data?.rows;
  if (!Array.isArray(rows)) throw new Error("종목 목록이 없는 응답입니다.");
  return parseNasdaqMarketCapRows(rows, previous, new Date().toISOString());
}
