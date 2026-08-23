import { collectCftcPositioning } from "@/lib/cftc-positioning";
import { collectEarningsCalendar } from "@/lib/earnings-calendar";
import { collectEconomicCalendar } from "@/lib/economic-calendar";
import { collectEiaEnergy } from "@/lib/eia-energy";
import { collectNasdaqMarketCapitalization } from "@/lib/nasdaq-market-cap";
import { collectSecFilings } from "@/lib/sec-filings";
import type { DataSourceStatus, MacroResearchPayload, MarketResearchPayload, MarketSeries, PortfolioItem, PortfolioPrice } from "@/lib/types";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

export async function collectMacroResearchData(
  fredApiKey: string,
  eiaApiKey: string | undefined,
  previous: MacroResearchPayload,
): Promise<MacroResearchPayload & { metrics: Record<string, unknown> }> {
  const now = new Date().toISOString();
  const [calendarResult, positioningResult, energyResult] = await Promise.allSettled([
    collectEconomicCalendar(fredApiKey),
    collectCftcPositioning(),
    eiaApiKey ? collectEiaEnergy(eiaApiKey, previous.energy) : Promise.resolve(null),
  ]);

  const warnings: string[] = [];
  const statuses: DataSourceStatus[] = [];

  const economicEvents = calendarResult.status === "fulfilled" ? calendarResult.value : previous.economicEvents;
  if (calendarResult.status === "rejected") warnings.push(`FRED 경제 일정: ${errorText(calendarResult.reason)}`);
  statuses.push({
    source: "fred_calendar",
    label: "경제 일정",
    state: calendarResult.status === "fulfilled" ? "fresh" : previous.economicEvents.length ? "stale" : "error",
    updatedAt: calendarResult.status === "fulfilled" ? now : previous.updatedAt,
    observationDate: economicEvents[0]?.date,
    message: calendarResult.status === "rejected" ? errorText(calendarResult.reason) : undefined,
  });

  const positioning = positioningResult.status === "fulfilled" ? positioningResult.value : previous.positioning;
  if (positioningResult.status === "rejected") warnings.push(`CFTC COT: ${errorText(positioningResult.reason)}`);
  statuses.push({
    source: "cftc",
    label: "CFTC 선물 포지셔닝",
    state: positioningResult.status === "fulfilled" ? "fresh" : previous.positioning.length ? "stale" : "error",
    updatedAt: positioningResult.status === "fulfilled" ? now : previous.updatedAt,
    observationDate: latestDate(positioning.map((item) => item.observationDate)),
    message: positioningResult.status === "rejected" ? errorText(positioningResult.reason) : undefined,
  });

  let energy = previous.energy;
  if (!eiaApiKey) {
    statuses.push({ source: "eia", label: "EIA 원유 수급", state: "not_configured", updatedAt: previous.updatedAt, message: "EIA_API_KEY를 등록하면 주간 원유 수급을 수집합니다." });
  } else if (energyResult.status === "fulfilled" && energyResult.value) {
    energy = energyResult.value.series;
    warnings.push(...energyResult.value.warnings);
    statuses.push({
      source: "eia",
      label: "EIA 원유 수급",
      state: energyResult.value.freshCount > 0 ? "fresh" : energy.length ? "stale" : "error",
      updatedAt: energyResult.value.freshCount > 0 ? now : previous.updatedAt,
      observationDate: latestDate(energy.map((item) => item.observationDate)),
      message: energyResult.value.warnings[0],
    });
  } else {
    const message = energyResult.status === "rejected" ? errorText(energyResult.reason) : "EIA 응답이 없습니다.";
    warnings.push(`EIA 원유 수급: ${message}`);
    statuses.push({ source: "eia", label: "EIA 원유 수급", state: energy.length ? "stale" : "error", updatedAt: previous.updatedAt, observationDate: latestDate(energy.map((item) => item.observationDate)), message });
  }

  const hasFresh = statuses.some((status) => status.state === "fresh");
  return {
    updatedAt: hasFresh ? now : previous.updatedAt,
    economicEvents,
    energy,
    positioning,
    statuses,
    warnings: [...new Set(warnings)].slice(0, 30),
    metrics: {
      fredCalendarRequests: 1,
      cftcRequests: 1,
      eiaRequests: energyResult.status === "fulfilled" && energyResult.value ? energyResult.value.requestCount : 0,
      economicEvents: economicEvents.length,
      energySeries: energy.length,
      positioningSeries: positioning.length,
      warnings: warnings.length,
    },
  };
}

function portfolioPrice(series: MarketSeries): PortfolioPrice {
  return {
    ticker: series.symbol,
    currency: series.currency,
    current: series.current,
    previous: series.previous,
    changePercent: series.changePercent,
    observationDate: series.observationDate,
    peakValue: series.peakValue,
    peakDate: series.peakDate,
    drawdownPercent: series.drawdownPercent,
    points: series.points,
  };
}

export async function collectMarketResearchData(
  items: PortfolioItem[],
  freshPortfolioSeries: MarketSeries[],
  priceWarnings: string[],
  alphaVantageApiKey: string | undefined,
  secUserAgent: string | undefined,
  previous: MarketResearchPayload,
): Promise<MarketResearchPayload & { metrics: Record<string, unknown> }> {
  const now = new Date().toISOString();
  const enabled = items.filter((item) => item.enabled);
  const tickers = enabled.map((item) => item.ticker);
  const previousPriceMap = new Map(previous.portfolioPrices.map((price) => [price.ticker, price]));
  for (const series of freshPortfolioSeries) previousPriceMap.set(series.symbol, portfolioPrice(series));
  const portfolioPrices = tickers.flatMap((ticker) => {
    const price = previousPriceMap.get(ticker);
    return price ? [price] : [];
  });

  const secPromise = !tickers.length || !secUserAgent ? Promise.resolve(null) : collectSecFilings(tickers, secUserAgent);
  const earningsPromise = !tickers.length || !alphaVantageApiKey ? Promise.resolve(null) : collectEarningsCalendar(alphaVantageApiKey, tickers);
  const marketCapPromise = collectNasdaqMarketCapitalization(previous.marketCapitalization ?? null);
  const [secResult, earningsResult, marketCapResult] = await Promise.allSettled([secPromise, earningsPromise, marketCapPromise]);
  const warnings = [...priceWarnings];
  const statuses: DataSourceStatus[] = [];

  statuses.push({
    source: "portfolio_prices",
    label: "관심종목 가격",
    state: !tickers.length ? "fresh" : freshPortfolioSeries.length ? "fresh" : portfolioPrices.length ? "stale" : "error",
    updatedAt: freshPortfolioSeries.length ? now : previous.updatedAt,
    observationDate: latestDate(portfolioPrices.map((price) => price.observationDate)),
    message: priceWarnings[0],
  });

  let secFilings = tickers.length ? previous.secFilings.filter((filing) => tickers.includes(filing.ticker)) : [];
  let fundamentals = tickers.length ? (previous.fundamentals ?? []).filter((item) => tickers.includes(item.ticker)) : [];
  if (!secUserAgent) {
    statuses.push({ source: "sec", label: "SEC 공시", state: "not_configured", updatedAt: previous.updatedAt, message: "SEC_USER_AGENT에 이름과 연락 이메일을 등록하세요." });
  } else if (secResult.status === "fulfilled" && secResult.value) {
    secFilings = secResult.value.filings;
    const fundamentalByTicker = new Map(fundamentals.map((item) => [item.ticker, item]));
    for (const item of secResult.value.fundamentals) fundamentalByTicker.set(item.ticker, item);
    fundamentals = tickers.flatMap((ticker) => fundamentalByTicker.get(ticker) ?? []);
    warnings.push(...secResult.value.warnings.map((warning) => `SEC ${warning}`));
    statuses.push({ source: "sec", label: "SEC 공시", state: "fresh", updatedAt: now, observationDate: secFilings[0]?.filedAt, message: secResult.value.warnings[0] });
  } else {
    const message = secResult.status === "rejected" ? errorText(secResult.reason) : "SEC 응답이 없습니다.";
    warnings.push(`SEC 공시: ${message}`);
    statuses.push({ source: "sec", label: "SEC 공시", state: secFilings.length ? "stale" : "error", updatedAt: previous.updatedAt, observationDate: secFilings[0]?.filedAt, message });
  }

  let earningsEvents = tickers.length ? previous.earningsEvents.filter((event) => tickers.includes(event.ticker)) : [];
  if (!alphaVantageApiKey) {
    statuses.push({ source: "earnings", label: "실적 일정", state: "not_configured", updatedAt: previous.updatedAt, message: "ALPHA_VANTAGE_API_KEY가 있으면 관심종목 실적 일정을 추가합니다." });
  } else if (earningsResult.status === "fulfilled" && earningsResult.value) {
    earningsEvents = earningsResult.value;
    statuses.push({ source: "earnings", label: "실적 일정", state: "fresh", updatedAt: now, observationDate: earningsEvents[0]?.reportDate });
  } else {
    const message = earningsResult.status === "rejected" ? errorText(earningsResult.reason) : "실적 일정 응답이 없습니다.";
    warnings.push(`실적 일정: ${message}`);
    statuses.push({ source: "earnings", label: "실적 일정", state: earningsEvents.length ? "stale" : "error", updatedAt: previous.updatedAt, observationDate: earningsEvents[0]?.reportDate, message });
  }

  let marketCapitalization = previous.marketCapitalization ?? null;
  if (marketCapResult.status === "fulfilled") {
    marketCapitalization = marketCapResult.value;
    statuses.push({ source: "nasdaq_market_cap", label: "미국주식 시가총액", state: "fresh", updatedAt: marketCapResult.value.updatedAt });
  } else {
    const message = errorText(marketCapResult.reason);
    warnings.push(`미국주식 시가총액: ${marketCapitalization ? "이전 값 유지 · " : "수집 실패 · "}${message}`);
    statuses.push({ source: "nasdaq_market_cap", label: "미국주식 시가총액", state: marketCapitalization ? "stale" : "error", updatedAt: marketCapitalization?.updatedAt ?? previous.updatedAt, message });
  }

  return {
    updatedAt: statuses.some((status) => status.state === "fresh") ? now : previous.updatedAt,
    portfolioPrices,
    secFilings,
    fundamentals,
    earningsEvents,
    marketCapitalization,
    statuses,
    warnings: [...new Set(warnings)].slice(0, 40),
    metrics: {
      portfolioSymbols: tickers.length,
      freshPortfolioPrices: freshPortfolioSeries.length,
      secRequests: secResult.status === "fulfilled" && secResult.value ? secResult.value.requestCount : 0,
      secFilings: secFilings.length,
      fundamentals: fundamentals.length,
      earningsRequests: alphaVantageApiKey && tickers.length ? 1 : 0,
      earningsEvents: earningsEvents.length,
      marketCapRequests: 1,
      marketCapCompanies: marketCapitalization?.items.length ?? 0,
      warnings: warnings.length,
    },
  };
}
