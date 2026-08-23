import { describe, expect, it } from "vitest";
import { parseNasdaqMarketCapRows } from "@/lib/nasdaq-market-cap";
import type { MarketCapitalizationSnapshot } from "@/lib/types";

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: `T${String(index).padStart(3, "0")}`,
    name: `Test ${index} Common Stock`,
    marketCap: String((count - index) * 1_000_000),
    lastsale: `$${100 - index / 10}`,
    pctchange: index % 2 ? "-1.5%" : "+2.5%",
    sector: index % 2 ? "Finance" : "Technology",
    url: `/market-activity/stocks/t${index}`,
  }));
}

describe("Nasdaq market-cap parser", () => {
  it("sorts, caps at 200 and excludes non-common securities", () => {
    const input = [...rows(205), { symbol: "BADW", name: "Bad Corp Warrant", marketCap: "999999999999" }];
    const result = parseNasdaqMarketCapRows(input, null, "2026-08-23T00:00:00.000Z");
    expect(result.items).toHaveLength(200);
    expect(result.items[0]).toMatchObject({ rank: 1, symbol: "T000", dayChangePercent: 2.5 });
    expect(result.items.some((item) => item.symbol === "BADW")).toBe(false);
  });

  it("calculates rank and market-cap changes against the previous refresh", () => {
    const previous: MarketCapitalizationSnapshot = {
      provider: "Nasdaq Screener",
      updatedAt: "2026-08-22T00:00:00.000Z",
      universeCount: 120,
      items: rows(120).map((row, index) => ({
        rank: index + 1, previousRank: null, rankChange: null, symbol: row.symbol, name: row.name,
        marketCap: Number(row.marketCap), previousMarketCap: null, marketCapChangePercent: null,
        lastPrice: 100, dayChangePercent: 0, sector: "Technology", industry: "", country: "", sourceUrl: "https://www.nasdaq.com",
      })),
    };
    const next = rows(120);
    [next[0], next[1]] = [next[1], next[0]];
    next[0].marketCap = "140000000";
    const result = parseNasdaqMarketCapRows(next, previous, "2026-08-23T00:00:00.000Z");
    expect(result.items[0]).toMatchObject({ symbol: "T001", rank: 1, previousRank: 2, rankChange: 1 });
    expect(result.items[0].marketCapChangePercent).toBeCloseTo(17.647, 3);
  });
});
