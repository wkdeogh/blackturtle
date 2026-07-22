import { collectFearGreedData } from "@/lib/fear-greed";
import { collectFredData } from "@/lib/fred";
import { collectWtiFuturesData } from "@/lib/wti-futures";
import type { MacroSeries } from "@/lib/types";

export async function collectMacroData(apiKey: string, previous: MacroSeries[] = [], massiveApiKey?: string): Promise<MacroSeries[]> {
  const previousFutures = previous.find((series) => series.id === "WTI_FUTURES_FRONT");
  const [fredSeries, fearGreedResult, wtiFutures] = await Promise.all([
    collectFredData(apiKey),
    collectFearGreedData().then((series) => ({ series, error: null })).catch((error: unknown) => ({ series: null, error })),
    massiveApiKey ? collectWtiFuturesData(massiveApiKey) : Promise.resolve(previousFutures),
  ]);

  const previousFearGreed = previous.find((series) => series.id === "CNN_FEAR_GREED");
  const fearGreed = fearGreedResult.series ?? previousFearGreed;
  return [fearGreed, ...fredSeries, wtiFutures].filter((series): series is MacroSeries => Boolean(series));
}
