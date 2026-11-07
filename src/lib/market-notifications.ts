import { fearGreedBand } from "@/lib/fear-greed-band";
import type { DashboardSnapshot, MarketSeries } from "@/lib/types";

export interface MarketNotification {
  key: string;
  title: string;
  body: string;
  url: "/macro" | "/market";
}

function nasdaq(snapshot: DashboardSnapshot | null): MarketSeries | undefined {
  return snapshot?.market?.series.find((series) => series.id === "nasdaq" && series.symbol === "QQQ");
}

function validScore(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validPrice(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

// A running closing high, seeded from the existing history, never rolls off as
// the provider's three-year window advances. A new high naturally resets MDD.
export function nasdaqNotificationPeak(previous: DashboardSnapshot | null, current: DashboardSnapshot, storedPeak = 0): number {
  return Math.max(0, ...[storedPeak, nasdaq(previous)?.peakValue, nasdaq(current)?.peakValue, nasdaq(current)?.current]
    .filter(validPrice));
}

export function buildMarketNotifications(previous: DashboardSnapshot | null, current: DashboardSnapshot, storedPeak = 0): MarketNotification[] {
  const notifications: MarketNotification[] = [];
  const before = previous?.macro.find((series) => series.id === "CNN_FEAR_GREED");
  const after = current.macro.find((series) => series.id === "CNN_FEAR_GREED");
  if (before && after && validScore(before.current) && validScore(after.current)
    && after.observationDate >= before.observationDate && before.current !== after.current) {
    const oldBand = fearGreedBand(before.current);
    const newBand = fearGreedBand(after.current);
    const score = Number(after.current.toFixed(2));
    if (oldBand.key !== newBand.key) notifications.push({
      key: "fear-greed-band", title: "공포탐욕지수 구간 변경 알림",
      body: `${oldBand.label} → ${newBand.label} (${score})`, url: "/macro",
    });
    if (before.current > 10 && after.current <= 10) notifications.push({
      key: "fear-greed-ultra-fear", title: "공포탐욕지수 알림",
      body: `공포탐욕지수가 초극단적공포구간에 들어갔습니다. (${score})`, url: "/macro",
    });
    if (before.current < 90 && after.current >= 90) notifications.push({
      key: "fear-greed-ultra-greed", title: "공포탐욕지수 알림",
      body: `공포탐욕지수가 초극단적탐욕구간에 들어갔습니다. (${score})`, url: "/macro",
    });
  }

  const oldNasdaq = nasdaq(previous);
  const newNasdaq = nasdaq(current);
  if (oldNasdaq && newNasdaq && validPrice(oldNasdaq.current) && validPrice(newNasdaq.current)
    && newNasdaq.observationDate >= oldNasdaq.observationDate
    && (newNasdaq.current !== oldNasdaq.current || newNasdaq.observationDate !== oldNasdaq.observationDate)) {
    const oldPeak = Math.max(oldNasdaq.current, validPrice(oldNasdaq.peakValue) ? oldNasdaq.peakValue : 0, validPrice(storedPeak) ? storedPeak : 0);
    const newPeak = nasdaqNotificationPeak(previous, current, storedPeak);
    const oldDrop = (1 - oldNasdaq.current / oldPeak) * 100;
    const newDrop = (1 - newNasdaq.current / newPeak) * 100;
    // Float error at an exact threshold (e.g. 95 / 100) must not miss an alert.
    for (let threshold = 5; threshold < 100; threshold += 5) {
      if (oldDrop + 1e-9 < threshold && newDrop + 1e-9 >= threshold) notifications.push({
        key: `nasdaq-mdd-${threshold}`, title: "나스닥MDD알림", body: `-${threshold}%`, url: "/market",
      });
    }
  }
  return notifications;
}
