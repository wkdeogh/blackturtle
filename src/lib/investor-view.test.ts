import { describe, expect, it } from "vitest";
import { calendarDayDistance, newYorkDate, rangePerformance, withinCalendarWindow } from "@/lib/investor-view";

describe("investor comparison", () => {
  it("uses the actual first and last observations in the selected range", () => {
    const points = [{ date: "2024-09-07", value: 50 }, { date: "2026-03-09", value: 100 }, { date: "2026-09-07", value: 120 }];
    expect(rangePerformance(points, "6M")).toEqual({ percent: expect.closeTo(20), start: "2026-03-09", end: "2026-09-07" });
    expect(rangePerformance(points, "3Y")?.percent).toBeCloseTo(140);
  });
  it("does not invent a return when no baseline exists", () => {
    expect(rangePerformance([], "1Y")).toBeNull();
    expect(rangePerformance([{ date: "2026-09-07", value: 100 }], "1Y")).toBeNull();
    expect(rangePerformance([{ date: "2026-09-01", value: 0 }, { date: "2026-09-07", value: 100 }], "1Y")).toBeNull();
  });
});

describe("US event dates", () => {
  it("keeps the current US date after midnight UTC in summer and winter", () => {
    expect(newYorkDate(new Date("2026-09-08T02:00:00Z"))).toBe("2026-09-07");
    expect(newYorkDate(new Date("2026-01-08T04:30:00Z"))).toBe("2026-01-07");
    expect(newYorkDate(new Date("2026-09-08T04:00:00Z"))).toBe("2026-09-08");
  });
  it("includes today and exactly seven calendar dates across DST", () => {
    expect(withinCalendarWindow("2026-03-07", "2026-03-07", 7)).toBe(true);
    expect(withinCalendarWindow("2026-03-13", "2026-03-07", 7)).toBe(true);
    expect(withinCalendarWindow("2026-03-14", "2026-03-07", 7)).toBe(false);
    expect(withinCalendarWindow("2026-03-06", "2026-03-07", 7)).toBe(false);
    expect(calendarDayDistance("2026-03-07", "2026-03-09")).toBe(2);
  });
});
