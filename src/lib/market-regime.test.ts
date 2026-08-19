import { describe, expect, it } from "vitest";
import { buildMarketRegime } from "@/lib/market-regime";
import type { DashboardSnapshot, MacroSeries, MarketSeries } from "@/lib/types";

function dates(count: number, start = 100, slope = 1) {
  const date = new Date("2025-01-01T00:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(date); current.setUTCDate(current.getUTCDate() + index);
    return { date: current.toISOString().slice(0, 10), value: start + index * slope };
  });
}

function macro(id: string, current: number, values = dates(20, current - 1, 0.05)): MacroSeries {
  return { id, label: id, group: "test", unit: "%", decimals: 2, current, previous: values.at(-2)?.value ?? null, change: 0, observationDate: values.at(-1)!.date, points: values };
}

function market(symbol: string, slope: number): MarketSeries {
  const points = dates(260, 100, slope);
  const current = points.at(-1)!.value;
  return { id: symbol.toLowerCase(), label: symbol, symbol, group: "market", instrumentType: "etf", interval: "daily", currency: "USD", decimals: 2, current, previous: points.at(-2)!.value, change: slope, changePercent: 0, observationDate: points.at(-1)!.date, peakValue: current, peakDate: points.at(-1)!.date, drawdownPercent: 0, points };
}

describe("market regime", () => {
  it("combines macro axes and relative-strength breadth signals", () => {
    const series = [market("SPY", 0.2), market("RSP", 0.35), market("IWM", 0.28), market("SOXX", 0.4), market("HYG", 0.18), market("IEF", 0.05), market("XLY", 0.3), market("XLP", 0.1)];
    const snapshot: DashboardSnapshot = {
      version: 1, generatedAt: "2026-01-01T00:00:00Z",
      macro: [macro("UNRATE", 4), macro("PCEPILFE", 120, dates(24, 100, 0.8)), macro("NFCI", -0.4), macro("BAMLH0A0HYM2", 3), macro("VIXCLS", 16), macro("CNN_FEAR_GREED", 60)],
      market: { provider: "Twelve Data", peakWindowYears: 3, series, countryEtfs: [], warnings: [] },
      social: { periodDays: 7, accounts: [], posts: [], companies: [], analyzedPostCount: 0 },
    };
    const regime = buildMarketRegime(snapshot);
    expect(regime.axes).toHaveLength(4);
    expect(regime.relatives.map((item) => item.id)).toContain("breadth");
    expect(regime.relatives.find((item) => item.id === "breadth")?.state).toBe("leading");
    expect(Number.isFinite(regime.score)).toBe(true);
  });
});
