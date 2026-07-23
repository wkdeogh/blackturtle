import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { MacroPoint, MacroSeries } from "@/lib/types";

const MASSIVE_API_BASE = "https://api.massive.com/futures/v1";

interface FuturesContract {
  active?: boolean;
  days_to_maturity?: number;
  last_trade_date?: string;
  name?: string;
  ticker?: string;
}

interface ContractsResponse {
  results?: FuturesContract[];
  status?: string;
  error?: string;
  message?: string;
}

interface AggregateBar {
  close?: number;
  session_end_date?: string;
  settlement_price?: number;
}

interface AggregatesResponse {
  results?: AggregateBar[];
  status?: string;
  error?: string;
  message?: string;
}

function apiError(body: ContractsResponse | AggregatesResponse, fallback: string): string {
  return body.error ?? body.message ?? fallback;
}

export async function collectWtiFuturesData(apiKey: string): Promise<MacroSeries> {
  const today = new Date().toISOString().slice(0, 10);
  const contractParams = new URLSearchParams({
    product_code: "CL",
    active: "true",
    type: "single",
    date: today,
    limit: "1000",
    apiKey,
  });
  const contractResponse = await fetchWithTimeout(`${MASSIVE_API_BASE}/contracts?${contractParams}`, {
    cache: "no-store",
  }, 30_000, "WTI 선물 계약");
  const contractBody = await readJsonResponse<ContractsResponse>(contractResponse, "WTI 선물 계약");
  if (!contractResponse.ok || contractBody.status !== "OK") {
    throw new Error(`WTI 선물 계약: ${apiError(contractBody, contractResponse.statusText)}`);
  }

  const contract = (contractBody.results ?? [])
    .filter((item) => item.active !== false && typeof item.ticker === "string" && typeof item.last_trade_date === "string")
    .filter((item) => item.last_trade_date! >= today && (item.days_to_maturity ?? 1) >= 0)
    .sort((left, right) => left.last_trade_date!.localeCompare(right.last_trade_date!))[0];
  if (!contract?.ticker) throw new Error("WTI 선물 계약: 활성 최근월물 계약을 찾지 못했습니다.");

  const aggregateParams = new URLSearchParams({
    resolution: "1session",
    limit: "180",
    apiKey,
  });
  const aggregateResponse = await fetchWithTimeout(`${MASSIVE_API_BASE}/aggs/${encodeURIComponent(contract.ticker)}?${aggregateParams}`, {
    cache: "no-store",
  }, 30_000, `WTI 선물 ${contract.ticker}`);
  const aggregateBody = await readJsonResponse<AggregatesResponse>(aggregateResponse, `WTI 선물 ${contract.ticker}`);
  if (!aggregateResponse.ok || aggregateBody.status !== "OK") {
    throw new Error(`WTI 선물 ${contract.ticker}: ${apiError(aggregateBody, aggregateResponse.statusText)}`);
  }

  const byDate = new Map<string, MacroPoint>();
  for (const bar of aggregateBody.results ?? []) {
    // Massive may expose 0 as an unset settlement value for the latest session.
    // Prefer a non-zero settlement, then a non-zero close. Keep legitimate negative oil prices.
    const settlement = Number.isFinite(bar.settlement_price) && bar.settlement_price !== 0 ? bar.settlement_price : undefined;
    const close = Number.isFinite(bar.close) && bar.close !== 0 ? bar.close : undefined;
    const value = settlement ?? close;
    if (!bar.session_end_date || !/^\d{4}-\d{2}-\d{2}$/.test(bar.session_end_date) || !Number.isFinite(value)) continue;
    byDate.set(bar.session_end_date, { date: bar.session_end_date, value: value! });
  }
  const points = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (points.length < 2) throw new Error(`WTI 선물 ${contract.ticker}: 유효한 일간 가격이 부족합니다.`);

  const current = points.at(-1)!;
  const previous = points.at(-2)!.value;
  return {
    id: "WTI_FUTURES_FRONT",
    label: `WTI 원유 선물 최근월물 (${contract.ticker})`,
    group: "원자재",
    unit: "달러/배럴",
    decimals: 2,
    current: current.value,
    previous,
    change: current.value - previous,
    observationDate: current.date,
    points,
  };
}
