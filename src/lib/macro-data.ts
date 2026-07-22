import { collectFearGreedData } from "@/lib/fear-greed";
import { collectFredData } from "@/lib/fred";
import type { MacroSeries } from "@/lib/types";

export async function collectMacroData(apiKey: string, previous: MacroSeries[] = []): Promise<MacroSeries[]> {
  const [fredSeries, fearGreedResult] = await Promise.all([
    collectFredData(apiKey),
    collectFearGreedData().then((series) => ({ series, error: null })).catch((error: unknown) => ({ series: null, error })),
  ]);

  const previousFearGreed = previous.find((series) => series.id === "CNN_FEAR_GREED");
  const fearGreed = fearGreedResult.series ?? previousFearGreed;
  return fearGreed ? [fearGreed, ...fredSeries] : fredSeries;
}
