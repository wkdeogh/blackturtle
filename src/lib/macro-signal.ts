import type { MacroPoint, MacroSeries } from "@/lib/types";

export type MacroSignalLevel = "good" | "watch" | "risk" | "neutral";

export interface MacroSignal {
  level: MacroSignalLevel;
  label: "양호" | "주의" | "위험" | "중립";
  detail: string;
}

const LABELS: Record<MacroSignalLevel, MacroSignal["label"]> = {
  good: "양호",
  watch: "주의",
  risk: "위험",
  neutral: "중립",
};

function signal(level: MacroSignalLevel, detail: string): MacroSignal {
  return { level, label: LABELS[level], detail };
}

function format(value: number, digits = 1): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function yearOverYear(points: MacroPoint[]): number | null {
  if (points.length < 13) return null;
  const current = points.at(-1)!.value;
  const previousYear = points.at(-13)!.value;
  if (previousYear === 0) return null;
  return ((current / previousYear) - 1) * 100;
}

function recentAverageChange(points: MacroPoint[], periods: number): number | null {
  if (points.length < periods + 1) return null;
  const changes: number[] = [];
  for (let index = points.length - periods; index < points.length; index += 1) {
    changes.push(points[index].value - points[index - 1].value);
  }
  return changes.reduce((sum, value) => sum + value, 0) / changes.length;
}

function sahmGap(points: MacroPoint[]): { average: number; gap: number } | null {
  if (points.length < 15) return null;
  const averages: number[] = [];
  for (let index = 2; index < points.length; index += 1) {
    averages.push((points[index].value + points[index - 1].value + points[index - 2].value) / 3);
  }
  const latest = averages.at(-1)!;
  const recentMinimum = Math.min(...averages.slice(-13));
  return { average: latest, gap: latest - recentMinimum };
}

function yieldSignal(value: number, maturity: "단기" | "장기"): MacroSignal {
  if (value >= 4.5) return signal("risk", `${maturity}금리 ${format(value, 2)}%로 할인율·차입비용 부담이 큰 구간입니다.`);
  if (value >= 3.5) return signal("watch", `${maturity}금리 ${format(value, 2)}%로 금리 부담을 지켜볼 구간입니다.`);
  return signal("good", `${maturity}금리 ${format(value, 2)}%로 금리 부담이 비교적 낮은 구간입니다.`);
}

export function getMacroSignal(series: MacroSeries): MacroSignal {
  switch (series.id) {
    case "DGS2":
      return yieldSignal(series.current, "단기");
    case "DGS10":
      return yieldSignal(series.current, "장기");
    case "T10Y2Y":
      if (series.current < 0) return signal("risk", `금리차 ${format(series.current, 2)}%p로 장단기 금리가 역전된 상태입니다.`);
      if (series.current < 0.5) return signal("watch", `금리차 +${format(series.current, 2)}%p로 0에 가까운 평탄 구간입니다.`);
      return signal("good", `금리차 +${format(series.current, 2)}%p로 수익률곡선이 정상적인 양의 기울기입니다.`);
    case "FEDFUNDS":
      if (series.current >= 5) return signal("risk", `정책금리 ${format(series.current, 2)}%로 유동성과 차입 여건의 긴축 부담이 큽니다.`);
      if (series.current >= 3) return signal("watch", `정책금리 ${format(series.current, 2)}%로 긴축 부담이 남아 있는 구간입니다.`);
      return signal("good", `정책금리 ${format(series.current, 2)}%로 유동성 부담이 비교적 낮은 구간입니다.`);
    case "CPIAUCSL": {
      const growth = yearOverYear(series.points);
      if (growth === null) return signal("neutral", "전년 대비 물가상승률을 계산할 관측값이 부족합니다.");
      if (growth < 0) return signal("risk", `CPI가 전년 대비 ${format(growth)}%로 하락해 디플레이션 위험을 확인할 구간입니다.`);
      if (growth <= 2.5) return signal("good", `CPI가 전년 대비 +${format(growth)}%로 물가 압력이 비교적 안정적입니다.`);
      if (growth <= 3.5) return signal("watch", `CPI가 전년 대비 +${format(growth)}%로 물가 압력이 아직 다소 높습니다.`);
      return signal("risk", `CPI가 전년 대비 +${format(growth)}%로 높은 물가 압력이 이어지는 구간입니다.`);
    }
    case "UNRATE": {
      const labor = sahmGap(series.points);
      if (!labor) return signal("neutral", "고용 위험 추세를 계산할 관측값이 부족합니다.");
      const detail = `실업률 3개월 평균 ${format(labor.average)}%, 최근 12개월 저점 대비 +${format(labor.gap, 2)}%p입니다.`;
      if (labor.average >= 6 || labor.gap >= 0.5) return signal("risk", detail);
      if (labor.average >= 5 || labor.gap >= 0.3) return signal("watch", detail);
      return signal("good", detail);
    }
    case "PAYEMS": {
      const average = recentAverageChange(series.points, 3);
      if (average === null) return signal("neutral", "최근 고용 증가세를 계산할 관측값이 부족합니다.");
      const prefix = average >= 0 ? "+" : "";
      const detail = `최근 3개월 월평균 비농업 고용 변화는 ${prefix}${format(average, 0)}천 명입니다.`;
      if (average < 50) return signal("risk", detail);
      if (average < 150) return signal("watch", detail);
      return signal("good", detail);
    }
    case "M2SL": {
      const growth = yearOverYear(series.points);
      if (growth === null) return signal("neutral", "전년 대비 통화량 증가율을 계산할 관측값이 부족합니다.");
      const prefix = growth >= 0 ? "+" : "";
      const detail = `M2가 전년 대비 ${prefix}${format(growth)}% 변했습니다.`;
      if (growth < -2 || growth > 12) return signal("risk", detail);
      if (growth < 0 || growth > 8) return signal("watch", detail);
      return signal("good", detail);
    }
    case "VIXCLS":
      if (series.current >= 30) return signal("risk", `VIX ${format(series.current, 2)}로 강한 위험회피 구간입니다.`);
      if (series.current >= 20) return signal("watch", `VIX ${format(series.current, 2)}로 시장 불안이 확대된 구간입니다.`);
      return signal("good", `VIX ${format(series.current, 2)}로 변동성 부담이 비교적 낮습니다.`);
    case "DCOILWTICO":
      if (series.current < 45) return signal("risk", `WTI ${format(series.current, 2)}달러로 원유 수요 약화 가능성을 확인할 구간입니다.`);
      if (series.current < 55) return signal("watch", `WTI ${format(series.current, 2)}달러로 낮은 가격의 원인을 지켜볼 구간입니다.`);
      if (series.current <= 85) return signal("good", `WTI ${format(series.current, 2)}달러로 수요와 물가 부담이 비교적 균형적인 구간입니다.`);
      if (series.current <= 100) return signal("watch", `WTI ${format(series.current, 2)}달러로 물가·원가 부담을 지켜볼 구간입니다.`);
      return signal("risk", `WTI ${format(series.current, 2)}달러로 물가·원가 충격 위험이 큰 구간입니다.`);
    default:
      return signal("neutral", "이 지표에는 아직 자동 상태 판단 기준이 없습니다.");
  }
}
