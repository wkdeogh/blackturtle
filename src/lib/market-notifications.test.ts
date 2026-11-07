import { describe, expect, it } from "vitest";
import { buildMarketNotifications, nasdaqNotificationPeak } from "@/lib/market-notifications";
import { buildMarketSeries, MARKET_DEFINITIONS, MARKET_CORE_BATCH_IDS, MARKET_SIGNAL_BATCH_IDS, MARKET_PRIMARY_IDS } from "@/lib/market-data";
import { fearGreedBand } from "@/lib/fear-greed-band";
import type { DashboardSnapshot } from "@/lib/types";

function snapshot(score = 50, price = 100, date = "2026-11-06", peak = 100): DashboardSnapshot {
  return {
    version: 1, generatedAt: `${date}T22:00:00Z`,
    macro: [{ id: "CNN_FEAR_GREED", label: "공포탐욕", group: "심리", unit: "점", decimals: 0, current: score, previous: null, change: null, observationDate: date, points: [{ date, value: score }] }],
    market: { provider: "Twelve Data", peakWindowYears: 3, warnings: [], countryEtfs: [], series: [buildMarketSeries(MARKET_DEFINITIONS.find((item) => item.id === "nasdaq")!, [{ date: "2026-01-01", value: peak }, { date, value: price }], "daily")] },
    social: { periodDays: 7, accounts: [], posts: [], companies: [], analyzedPostCount: 0 },
  };
}

describe("fear and greed notifications", () => {
  it.each([[24.99, "극단적 공포"], [25, "공포"], [44.99, "공포"], [45, "중립"], [54.99, "중립"], [55, "탐욕"], [74.99, "탐욕"], [75, "극단적 탐욕"]])("shares the card's band for %s", (score, label) => {
    expect(fearGreedBand(score as number).label).toBe(label);
  });
  it("includes previous and next bands and the new index value", () => {
    expect(buildMarketNotifications(snapshot(30), snapshot(20))).toEqual([{ key: "fear-greed-band", title: "공포탐욕지수 구간 변경 알림", body: "공포 → 극단적 공포 (20)", url: "/macro" }]);
    expect(buildMarketNotifications(snapshot(50), snapshot(61))[0].body).toBe("중립 → 탐욕 (61)");
  });
  it.each([[11, 10, "fear"], [12, 8, "fear"], [89, 90, "greed"], [80, 95, "greed"]])("alerts on the inclusive ultra boundary %s → %s", (before, after, key) => {
    expect(buildMarketNotifications(snapshot(before), snapshot(after)).map((event) => event.key)).toContain(`fear-greed-ultra-${key}`);
  });
  it("emits a band change and an ultra entry independently", () => {
    const alerts = buildMarketNotifications(snapshot(30), snapshot(8));
    expect(alerts).toHaveLength(2);
    expect(alerts[1].body).toBe("공포탐욕지수가 초극단적공포구간에 들어갔습니다. (8)");
  });
  it.each([[10, 8], [8, 10], [90, 95], [95, 90], [30, 31]])("does not repeat within the same zone: %s → %s", (before, after) => {
    expect(buildMarketNotifications(snapshot(before), snapshot(after))).toEqual([]);
  });
  it("alerts again after exiting and re-entering an ultra zone", () => {
    expect(buildMarketNotifications(snapshot(8), snapshot(12))).toEqual([]);
    expect(buildMarketNotifications(snapshot(12), snapshot(10))).toHaveLength(1);
  });
  it("does not invent a previous refresh on the first collection", () => {
    expect(buildMarketNotifications(null, snapshot(8, 70))).toEqual([]);
  });
  it("ignores older observations and invalid scores", () => {
    expect(buildMarketNotifications(snapshot(50), snapshot(8, 100, "2026-11-05"))).toEqual([]);
    expect(buildMarketNotifications(snapshot(50), snapshot(NaN))).toEqual([]);
  });
});

describe("QQQ drawdown notifications", () => {
  it.each([[100, 95, ["-5%"]], [96, 89, ["-5%", "-10%"]], [91, 85, ["-10%", "-15%"]], [95, 94, []], [90, 94, []], [95.001, 95, ["-5%"]]])("handles %s → %s against a 100 high", (before, after, bodies) => {
    expect(buildMarketNotifications(snapshot(50, before), snapshot(50, after)).map((event) => event.body)).toEqual(bodies);
  });
  it("alerts on a recross after recovery, and resets at a new closing high", () => {
    expect(buildMarketNotifications(snapshot(50, 96), snapshot(50, 95))[0].body).toBe("-5%");
    expect(buildMarketNotifications(snapshot(50, 95), snapshot(50, 110))).toEqual([]);
    expect(buildMarketNotifications(snapshot(50, 110), snapshot(50, 104.5), 110)[0].body).toBe("-5%");
  });
  it("retains a historical peak after the provider window rolls forward", () => {
    expect(nasdaqNotificationPeak(snapshot(50, 96, undefined, 98), snapshot(50, 95, undefined, 98), 100)).toBe(100);
    expect(buildMarketNotifications(snapshot(50, 96, undefined, 98), snapshot(50, 95, undefined, 98), 100)[0].body).toBe("-5%");
  });
  it("ignores unchanged carried-forward QQQ data in social or macro refreshes", () => {
    expect(buildMarketNotifications(snapshot(50, 85), snapshot(50, 85))).toEqual([]);
  });
  it("ignores a different instrument stored under the nasdaq key", () => {
    const after = snapshot(50, 85); after.market!.series[0].symbol = "DIA";
    expect(buildMarketNotifications(snapshot(), after)).toEqual([]);
  });
});

it("collects DIA exactly once while respecting the eight-credit batch size", () => {
  const batches = [MARKET_CORE_BATCH_IDS, MARKET_SIGNAL_BATCH_IDS];
  expect(batches.every((batch) => batch.length <= 8)).toBe(true);
  expect(batches.flat().sort()).toEqual([...MARKET_PRIMARY_IDS].sort());
  expect(MARKET_DEFINITIONS.find((item) => item.id === "dow")?.symbol).toBe("DIA");
});
