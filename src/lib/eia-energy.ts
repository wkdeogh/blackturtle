import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { ResearchTimeSeries } from "@/lib/types";

interface EiaResponse {
  response?: { data?: Array<Record<string, unknown>> };
  error?: string;
}

interface EnergyDefinition {
  id: string;
  seriesId: string;
  label: string;
  unit: string;
}

const DEFINITIONS: EnergyDefinition[] = [
  { id: "EIA_CRUDE_STOCKS", seriesId: "PET.WCESTUS1.W", label: "미국 상업용 원유 재고", unit: "천 배럴" },
  { id: "EIA_CUSHING_STOCKS", seriesId: "PET.W_EPC0_SAX_YCUOK_MBBL.W", label: "쿠싱 원유 재고", unit: "천 배럴" },
  { id: "EIA_CRUDE_PRODUCTION", seriesId: "PET.WCRFPUS2.W", label: "미국 원유 생산", unit: "천 배럴/일" },
  { id: "EIA_REFINERY_UTILIZATION", seriesId: "PET.WPULEUS3.W", label: "미국 정유설비 가동률", unit: "%" },
  { id: "EIA_GASOLINE_STOCKS", seriesId: "PET.WGTSTUS1.W", label: "미국 휘발유 재고", unit: "천 배럴" },
  { id: "EIA_DISTILLATE_STOCKS", seriesId: "PET.WDISTUS1.W", label: "미국 정제유 재고", unit: "천 배럴" },
];

function rowValue(row: Record<string, unknown>): number | null {
  for (const key of ["value", "Value", "series-value", "data"]) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  for (const [key, raw] of Object.entries(row)) {
    if (key === "period" || key.includes("description") || key === "units") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

async function collectSeries(definition: EnergyDefinition, apiKey: string): Promise<ResearchTimeSeries> {
  const params = new URLSearchParams({ api_key: apiKey, length: "180" });
  params.set("data[0]", "value");
  params.set("sort[0][column]", "period");
  params.set("sort[0][direction]", "desc");
  const response = await fetchWithTimeout(`https://api.eia.gov/v2/seriesid/${encodeURIComponent(definition.seriesId)}?${params}`, {
    cache: "no-store",
  }, 30_000, `EIA ${definition.label}`);
  const body = await readJsonResponse<EiaResponse>(response, `EIA ${definition.label}`);
  if (!response.ok || body.error) throw new Error(body.error ?? response.statusText);
  const points = (body.response?.data ?? []).flatMap((row) => {
    const date = typeof row.period === "string" ? row.period.slice(0, 10) : "";
    const value = rowValue(row);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && value !== null ? [{ date, value }] : [];
  }).sort((left, right) => left.date.localeCompare(right.date));
  if (!points.length) throw new Error("유효한 주간 관측값이 없습니다.");
  const current = points.at(-1)!;
  const previous = points.at(-2)?.value ?? null;
  return {
    id: definition.id,
    label: definition.label,
    unit: definition.unit,
    current: current.value,
    previous,
    change: previous === null ? null : current.value - previous,
    observationDate: current.date,
    points,
  };
}

export async function collectEiaEnergy(apiKey: string, previous: ResearchTimeSeries[] = []) {
  const settled = await Promise.allSettled(DEFINITIONS.map((definition) => collectSeries(definition, apiKey)));
  const previousById = new Map(previous.map((series) => [series.id, series]));
  const series: ResearchTimeSeries[] = [];
  const warnings: string[] = [];
  let freshCount = 0;
  settled.forEach((result, index) => {
    const definition = DEFINITIONS[index];
    if (result.status === "fulfilled") {
      series.push(result.value);
      freshCount += 1;
    } else {
      const stored = previousById.get(definition.id);
      if (stored) series.push(stored);
      warnings.push(`${definition.label}: ${stored ? "이전 값 유지" : "수집 실패"} · ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });
  return { series, warnings, freshCount, requestCount: DEFINITIONS.length };
}
