import { describe, expect, it } from "vitest";
import { buildMarketSeries, type MarketDefinition } from "@/lib/market-data";
import { marketTechnicals } from "@/lib/market-regime";

const definition: MarketDefinition = { id: "test", label: "Test", symbol: "TST", group: "market", instrumentType: "etf", currency: "USD", decimals: 2 };

function points(count: number, start = 100) {
  const first = new Date("2025-01-01T00:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first); date.setUTCDate(date.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), value: start + index * 0.2 + (index === count - 20 ? 25 : 0) };
  });
}

describe("market series", () => {
  it("calculates latest change and drawdown from stored history", () => {
    const series = buildMarketSeries(definition, points(300), "daily");
    expect(series.current).toBeCloseTo(159.8);
    expect(series.changePercent).toBeGreaterThan(0);
    expect(series.peakDate).toBe("2025-10-08");
    expect(series.drawdownPercent).toBeLessThan(0);
  });

  it("derives investor-facing technical context", () => {
    const technicals = marketTechnicals(buildMarketSeries(definition, points(300), "daily"));
    expect(technicals.oneMonth).not.toBeNull();
    expect(technicals.realizedVolatility20D).not.toBeNull();
    expect(technicals.above200Day).toBe(true);
    expect(technicals.distanceFrom52WeekHigh).toBeLessThan(0);
  });
});
