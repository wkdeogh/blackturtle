import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { MacroPoint, MacroSeries } from "@/lib/types";

const FEAR_GREED_DATA_URL = "https://raw.githubusercontent.com/whit3rabbit/fear-greed-data/main/fear-greed.csv";

function parseFearGreedCsv(csv: string): MacroPoint[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawValue] = line.split(",");
      return { date, value: Number(rawValue) };
    })
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value >= 0 && point.value <= 100)
    .slice(-260);
}

export async function collectFearGreedData(): Promise<MacroSeries> {
  const response = await fetchWithTimeout(FEAR_GREED_DATA_URL, { cache: "no-store" }, 20_000, "CNN 공포·탐욕 지수");
  if (!response.ok) throw new Error(`CNN 공포·탐욕 지수: ${response.status} ${response.statusText}`);

  const points = parseFearGreedCsv(await response.text());
  if (!points.length) throw new Error("CNN 공포·탐욕 지수: 유효한 관측값이 없습니다.");

  const current = points.at(-1)!;
  const previous = points.at(-2)?.value ?? null;
  return {
    id: "CNN_FEAR_GREED",
    label: "CNN 공포·탐욕 지수",
    group: "시장 심리",
    unit: "점",
    decimals: 0,
    current: current.value,
    previous,
    change: previous === null ? null : current.value - previous,
    observationDate: current.date,
    points,
  };
}
