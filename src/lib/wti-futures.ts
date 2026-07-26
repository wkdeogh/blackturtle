import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { MacroPoint, MacroSeries } from "@/lib/types";

const MASSIVE_API_BASE = "https://api.massive.com/futures/v1";

interface FuturesContract {
  active?: boolean;
  days_to_maturity?: number;
  last_trade_date?: string;
  name?: string;
  settlement_date?: string;
  ticker?: string;
}

type ActiveFuturesContract = FuturesContract & { ticker: string };

interface ContractSelection {
  contract: ActiveFuturesContract;
  usedPreviousTicker: boolean;
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

function chicagoDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function contractDaysRemaining(contract: FuturesContract, asOfDate: string): number {
  const maturityDate = contract.last_trade_date ?? contract.settlement_date;
  if (maturityDate) {
    const remaining = (Date.parse(`${maturityDate}T12:00:00Z`) - Date.parse(`${asOfDate}T12:00:00Z`)) / 86_400_000;
    if (Number.isFinite(remaining)) return Math.max(0, Math.round(remaining));
  }
  return contract.days_to_maturity ?? Number.MAX_SAFE_INTEGER;
}

function previousContractTicker(previous?: MacroSeries): string | null {
  const match = previous?.label.match(/\(([A-Z0-9]+)\)\s*$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

async function findFrontMonthContract(apiKey: string, fallbackTicker: string | null): Promise<ContractSelection> {
  const currentChicagoDate = chicagoDate();
  const attemptedDates: string[] = [];

  for (let offset = 0; offset <= 7; offset += 1) {
    const asOfDate = subtractDays(currentChicagoDate, offset);
    if (isWeekend(asOfDate)) continue;
    attemptedDates.push(asOfDate);
    const contractParams = new URLSearchParams({
      product_code: "CL",
      active: "true",
      type: "single",
      date: asOfDate,
      limit: "1000",
      apiKey,
    });
    const contractResponse = await fetchWithTimeout(`${MASSIVE_API_BASE}/contracts?${contractParams}`, {
      cache: "no-store",
    }, 30_000, `WTI 선물 계약 ${asOfDate}`);
    const contractBody = await readJsonResponse<ContractsResponse>(contractResponse, `WTI 선물 계약 ${asOfDate}`);
    if (!contractResponse.ok || contractBody.status !== "OK") {
      throw new Error(`WTI 선물 계약: ${apiError(contractBody, contractResponse.statusText)}`);
    }

    const contract = (contractBody.results ?? [])
      .filter((item) => item.active !== false && typeof item.ticker === "string")
      .filter((item) => !item.last_trade_date || item.last_trade_date >= asOfDate)
      .filter((item) => item.days_to_maturity === undefined || item.days_to_maturity >= 0)
      .sort((left, right) => contractDaysRemaining(left, asOfDate) - contractDaysRemaining(right, asOfDate))[0];
    if (contract?.ticker) return { contract: { ...contract, ticker: contract.ticker }, usedPreviousTicker: false };
  }

  if (fallbackTicker) {
    return { contract: { ticker: fallbackTicker }, usedPreviousTicker: true };
  }
  throw new Error(`WTI 선물 계약: 최근 거래일의 활성 최근월물 계약을 찾지 못했습니다. 조회 기준 ${attemptedDates.at(-1)}~${attemptedDates[0]}`);
}

export async function collectWtiFuturesData(apiKey: string, previous?: MacroSeries): Promise<MacroSeries> {
  const selection = await findFrontMonthContract(apiKey, previousContractTicker(previous));
  const contract = selection.contract;

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
  if (selection.usedPreviousTicker && previous && current.date <= previous.observationDate) {
    throw new Error(`WTI 선물 계약: 최근월물 탐색 결과가 없어 이전 계약 ${contract.ticker}을 확인했지만 새 거래일 데이터가 없습니다.`);
  }
  const previousValue = points.at(-2)!.value;
  return {
    id: "WTI_FUTURES_FRONT",
    label: `WTI 원유 선물 최근월물 (${contract.ticker})`,
    group: "원자재",
    unit: "달러/배럴",
    decimals: 2,
    current: current.value,
    previous: previousValue,
    change: current.value - previousValue,
    observationDate: current.date,
    points,
  };
}
