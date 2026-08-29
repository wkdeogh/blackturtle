import type { MarketPoint } from "@/lib/types";

export type MarketChartRange = "6M" | "1Y" | "3Y";

export function marketRangeCutoffDate(lastDate: string, range: MarketChartRange): string {
  const date = new Date(`${lastDate}T00:00:00Z`);
  if (range === "6M") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 6);
    const lastDayOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDayOfMonth));
  } else {
    date.setUTCFullYear(date.getUTCFullYear() - (range === "1Y" ? 1 : 3));
  }
  return date.toISOString().slice(0, 10);
}

export function marketPointsForRange(points: MarketPoint[], range: MarketChartRange): MarketPoint[] {
  const last = points.at(-1);
  if (!last) return [];
  const cutoff = marketRangeCutoffDate(last.date, range);
  return points.filter((point) => point.date >= cutoff);
}

export function marketDrawdownForRange(points: MarketPoint[], range: MarketChartRange) {
  const visible = marketPointsForRange(points, range);
  const current = visible.at(-1);
  if (!current) return null;
  const peak = visible.reduce((best, point) => point.value > best.value ? point : best, visible[0]);
  return {
    peakDate: peak.date,
    peakValue: peak.value,
    drawdownPercent: peak.value === 0 ? 0 : Math.min(((current.value / peak.value) - 1) * 100, 0),
  };
}

export function marketRangeLabel(range: MarketChartRange): string {
  return range === "6M" ? "최근 6개월" : range === "1Y" ? "최근 1년" : "최근 3년";
}
