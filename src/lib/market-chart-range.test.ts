import { describe, expect, it } from "vitest";
import { marketDrawdownForRange, marketPointsForRange, marketRangeLabel } from "@/lib/market-chart-range";

const points = [
  { date: "2022-08-29", value: 200 },
  { date: "2023-08-29", value: 180 },
  { date: "2025-02-28", value: 150 },
  { date: "2025-08-29", value: 120 },
  { date: "2026-02-28", value: 140 },
  { date: "2026-08-29", value: 100 },
];

describe("market chart ranges", () => {
  it("filters history using the selected chart range", () => {
    expect(marketPointsForRange(points, "6M").map((point) => point.date)).toEqual(["2026-02-28", "2026-08-29"]);
    expect(marketPointsForRange(points, "1Y").map((point) => point.date)).toEqual(["2025-08-29", "2026-02-28", "2026-08-29"]);
    expect(marketPointsForRange(points, "3Y").map((point) => point.date)).toEqual(points.slice(1).map((point) => point.date));
  });

  it("calculates peak and drawdown independently for each selected range", () => {
    expect(marketDrawdownForRange(points, "6M")).toEqual({ peakDate: "2026-02-28", peakValue: 140, drawdownPercent: expect.closeTo(-28.5714, 4) });
    expect(marketDrawdownForRange(points, "1Y")).toEqual({ peakDate: "2026-02-28", peakValue: 140, drawdownPercent: expect.closeTo(-28.5714, 4) });
    expect(marketDrawdownForRange(points, "3Y")).toEqual({ peakDate: "2023-08-29", peakValue: 180, drawdownPercent: expect.closeTo(-44.4444, 4) });
  });

  it("provides the matching Korean range label", () => {
    expect(marketRangeLabel("6M")).toBe("최근 6개월");
    expect(marketRangeLabel("1Y")).toBe("최근 1년");
    expect(marketRangeLabel("3Y")).toBe("최근 3년");
  });
});
