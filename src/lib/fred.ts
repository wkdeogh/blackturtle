import type { MacroSeries } from "@/lib/types";

interface FredDefinition {
  id: string;
  label: string;
  group: string;
  unit: string;
  decimals: number;
}

const SERIES: FredDefinition[] = [
  { id: "DGS2", label: "미국 2년물", group: "금리", unit: "%", decimals: 2 },
  { id: "DGS10", label: "미국 10년물", group: "금리", unit: "%", decimals: 2 },
  { id: "T10Y2Y", label: "10Y–2Y 스프레드", group: "금리", unit: "%p", decimals: 2 },
  { id: "FEDFUNDS", label: "연방기금금리", group: "금리", unit: "%", decimals: 2 },
  { id: "CPIAUCSL", label: "소비자물가지수", group: "물가", unit: "index", decimals: 1 },
  { id: "UNRATE", label: "실업률", group: "고용", unit: "%", decimals: 1 },
  { id: "PAYEMS", label: "비농업 고용", group: "고용", unit: "천 명", decimals: 0 },
  { id: "M2SL", label: "M2 통화량", group: "유동성", unit: "십억 달러", decimals: 1 },
  { id: "VIXCLS", label: "VIX", group: "심리", unit: "index", decimals: 2 },
];

interface FredResponse {
  observations?: Array<{ date: string; value: string }>;
  error_message?: string;
}

async function fetchSeries(definition: FredDefinition, apiKey: string): Promise<MacroSeries> {
  const params = new URLSearchParams({
    series_id: definition.id,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "24",
  });
  const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as FredResponse;
  if (!response.ok || body.error_message) {
    throw new Error(`FRED ${definition.id}: ${body.error_message ?? response.statusText}`);
  }

  const points = (body.observations ?? [])
    .filter((item) => item.value !== "." && Number.isFinite(Number(item.value)))
    .map((item) => ({ date: item.date, value: Number(item.value) }))
    .reverse();

  if (!points.length) throw new Error(`FRED ${definition.id}: 관측값이 없습니다.`);
  const current = points.at(-1)!;
  const previous = points.at(-2)?.value ?? null;
  return {
    ...definition,
    current: current.value,
    previous,
    change: previous === null ? null : current.value - previous,
    observationDate: current.date,
    points,
  };
}

export async function collectFredData(apiKey: string): Promise<MacroSeries[]> {
  return Promise.all(SERIES.map((definition) => fetchSeries(definition, apiKey)));
}
