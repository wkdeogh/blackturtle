import { collectFearGreedData } from "@/lib/fear-greed";
import { collectFredData } from "@/lib/fred";
import { collectWtiFuturesData } from "@/lib/wti-futures";
import type { MacroSeries } from "@/lib/types";

export interface MacroCollectionResult {
  series: MacroSeries[];
  warnings: string[];
  freshCount: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function collectMacroData(apiKey: string, previous: MacroSeries[] = [], massiveApiKey?: string): Promise<MacroCollectionResult> {
  const previousFutures = previous.find((series) => series.id === "WTI_FUTURES_FRONT");
  const previousFearGreed = previous.find((series) => series.id === "CNN_FEAR_GREED");
  const [fredResult, fearGreedResult, wtiResult] = await Promise.all([
    collectFredData(apiKey, previous),
    collectFearGreedData().then((series) => ({ series, error: null })).catch((error: unknown) => ({ series: null, error })),
    massiveApiKey
      ? collectWtiFuturesData(massiveApiKey).then((series) => ({ series, error: null })).catch((error: unknown) => ({ series: null, error }))
      : Promise.resolve({ series: null, error: null }),
  ]);

  const fearGreed = fearGreedResult.series ?? previousFearGreed;
  const wtiFutures = wtiResult.series ?? previousFutures;
  const warnings = [...fredResult.warnings];
  if (fearGreedResult.error) {
    warnings.push(`CNN 공포·탐욕 지수: ${previousFearGreed ? "새 데이터를 받지 못해 이전 값을 유지했습니다" : "수집하지 못했습니다"} · ${errorMessage(fearGreedResult.error)}`);
  }
  if (wtiResult.error) {
    warnings.push(`WTI 원유 선물: ${previousFutures ? "새 데이터를 받지 못해 이전 값을 유지했습니다" : "수집하지 못했습니다"} · ${errorMessage(wtiResult.error)}`);
  }

  const series = [fearGreed, ...fredResult.series, wtiFutures].filter((item): item is MacroSeries => Boolean(item));
  const freshCount = fredResult.freshCount + Number(Boolean(fearGreedResult.series)) + Number(Boolean(wtiResult.series));
  if (!series.length) {
    throw new Error(`매크로 데이터를 하나도 수집하지 못했습니다. ${warnings.slice(0, 3).join(" / ")}`);
  }
  return { series, warnings, freshCount };
}
