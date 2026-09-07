import { marketPointsForRange, type MarketChartRange } from "@/lib/market-chart-range";
import type { MarketPoint } from "@/lib/types";

export function rangePerformance(points: MarketPoint[], range: MarketChartRange) {
  const visible = marketPointsForRange(points, range);
  const first = visible[0];
  const last = visible.at(-1);
  if (!first || !last || first.date === last.date || first.value <= 0) return null;
  return { percent: (last.value / first.value - 1) * 100, start: first.date, end: last.date };
}

export function newYorkDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function calendarDayDistance(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function withinCalendarWindow(date: string, today: string, days: number): boolean {
  const distance = calendarDayDistance(today, date);
  return distance >= 0 && distance < days;
}
