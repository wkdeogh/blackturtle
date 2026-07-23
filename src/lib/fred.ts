import type { MacroSeries } from "@/lib/types";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";

interface FredDefinition {
  id: string;
  label: string;
  group: string;
  unit: string;
  decimals: number;
  description: string;
  readingGuide: string;
  observationLimit: number;
}

const SERIES: FredDefinition[] = [
  { id: "DGS2", label: "미국 2년물", group: "금리", unit: "%", decimals: 2, observationLimit: 260, description: "향후 1~2년의 연준 정책금리 기대가 빠르게 반영되는 단기 국채금리입니다.", readingGuide: "상승하면 긴축 기대와 금융 여건 부담이 커진 것으로 봅니다. 성장주에는 대체로 부담입니다." },
  { id: "DGS10", label: "미국 10년물", group: "금리", unit: "%", decimals: 2, observationLimit: 260, description: "장기 성장률·물가 기대와 기간 프리미엄이 함께 반영되는 대표 장기금리입니다.", readingGuide: "빠른 상승은 할인율을 높여 고평가·장기 성장주의 밸류에이션을 압박할 수 있습니다." },
  { id: "T10Y2Y", label: "미국 장단기 금리차 (10Y–2Y)", group: "금리", unit: "%p", decimals: 2, observationLimit: 520, description: "미국 10년물 금리에서 2년물 금리를 뺀 값으로 수익률곡선의 기울기를 보여줍니다.", readingGuide: "양수는 일반적인 정상 구간이고, 0 아래는 장단기 금리 역전입니다. 역전은 경기둔화 위험 신호이며 재차 정상화되는 속도도 함께 봅니다." },
  { id: "FEDFUNDS", label: "연방기금금리", group: "금리", unit: "%", decimals: 2, observationLimit: 60, description: "연준 통화정책의 기준이 되는 실효 단기금리입니다.", readingGuide: "높을수록 유동성과 차입 여건이 빡빡합니다. 인하는 우호적일 수 있지만 경기 약화 신호인지 함께 봅니다." },
  { id: "CPIAUCSL", label: "소비자물가지수", group: "물가", unit: "index", decimals: 1, observationLimit: 60, description: "미국 소비자가 구매하는 재화·서비스의 전반적인 가격 수준을 나타내는 지수입니다.", readingGuide: "절대 지수보다 전년 대비 상승률과 둔화·재가속 방향이 중요합니다. 이 카드는 가격 수준 추이를 보여줍니다." },
  { id: "UNRATE", label: "실업률", group: "고용", unit: "%", decimals: 1, observationLimit: 60, description: "경제활동인구 중 일자리가 없고 구직 중인 사람의 비율입니다.", readingGuide: "낮고 안정적이면 고용이 견조합니다. 단기간의 뚜렷한 상승은 경기와 소비 약화 신호일 수 있습니다." },
  { id: "PAYEMS", label: "비농업 고용", group: "고용", unit: "천 명", decimals: 0, observationLimit: 60, description: "농업을 제외한 미국 사업체의 전체 고용 인원 수준입니다.", readingGuide: "꾸준한 증가는 수요를 지지합니다. 증가세 둔화나 감소가 이어지면 고용 모멘텀 약화를 의심합니다." },
  { id: "M2SL", label: "M2 통화량", group: "유동성", unit: "십억 달러", decimals: 1, observationLimit: 60, description: "현금·요구불예금·저축성 예금 등을 합친 넓은 의미의 통화량입니다.", readingGuide: "지속적인 증가는 위험자산 유동성에 우호적일 수 있지만 단독 매매 타이밍 지표로 쓰지는 않습니다." },
  { id: "VIXCLS", label: "VIX 변동성 지수", group: "시장 심리", unit: "pt", decimals: 2, observationLimit: 260, description: "S&P 500 옵션 가격에 반영된 향후 약 30일의 기대 변동성입니다.", readingGuide: "20 위로 빠르게 오르면 불안 확대를, 30 이상은 강한 위험회피를 의심합니다. 절대값과 상승 속도를 함께 봅니다." },
  { id: "DCOILWTICO", label: "WTI 원유 가격", group: "원자재", unit: "달러/배럴", decimals: 2, observationLimit: 260, description: "미국 오클라호마 쿠싱에서 거래되는 서부 텍사스산 원유(WTI)의 일간 현물가격입니다.", readingGuide: "상승은 에너지 기업에 우호적일 수 있지만 물가와 운송·제조 비용에는 부담입니다. 급락은 공급 증가뿐 아니라 경기와 원유 수요 약화 신호일 수 있어 원인도 함께 봅니다." },
];

export const FRED_GUIDES = Object.fromEntries(
  SERIES.map(({ id, description, readingGuide }) => [id, { description, readingGuide }]),
) as Record<string, { description: string; readingGuide: string }>;

FRED_GUIDES.WTI_FUTURES_FRONT = {
  description: "NYMEX에서 거래되는 WTI 원유 선물 중 만기가 가장 가까운 활성 계약의 일간 가격입니다. 정산가가 있으면 정산가를, 없으면 종가를 사용합니다.",
  readingGuide: "현물보다 선물이 높으면 콘탱고, 낮으면 백워데이션 가능성을 봅니다. 이 차트는 연속선물이 아니라 현재 최근월물 개별 계약이므로 롤오버 뒤에는 계약과 과거 선이 바뀝니다.",
};

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
    limit: String(definition.observationLimit),
  });
  const response = await fetchWithTimeout(`https://api.stlouisfed.org/fred/series/observations?${params}`, {
    cache: "no-store",
  }, 30_000, `FRED ${definition.id}`);
  const body = await readJsonResponse<FredResponse>(response, `FRED ${definition.id}`);
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
    id: definition.id,
    label: definition.label,
    group: definition.group,
    unit: definition.unit,
    decimals: definition.decimals,
    current: current.value,
    previous,
    change: previous === null ? null : current.value - previous,
    observationDate: current.date,
    points,
  };
}

export interface FredCollectionResult {
  series: MacroSeries[];
  warnings: string[];
  freshCount: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function collectFredData(apiKey: string, previous: MacroSeries[] = []): Promise<FredCollectionResult> {
  const settled = await Promise.allSettled(SERIES.map((definition) => fetchSeries(definition, apiKey)));
  const previousById = new Map(previous.map((series) => [series.id, series]));
  const series: MacroSeries[] = [];
  const warnings: string[] = [];
  let freshCount = 0;

  settled.forEach((result, index) => {
    const definition = SERIES[index];
    if (result.status === "fulfilled") {
      series.push(result.value);
      freshCount += 1;
      return;
    }

    const stored = previousById.get(definition.id);
    if (stored) series.push(stored);
    warnings.push(`${definition.label} (${definition.id}): ${stored ? "새 데이터를 받지 못해 이전 값을 유지했습니다" : "수집하지 못했습니다"} · ${errorMessage(result.reason)}`);
  });

  return { series, warnings, freshCount };
}
