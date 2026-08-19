import type { DashboardSnapshot, MacroSeries, MarketPoint, MarketSeries } from "@/lib/types";

export interface RegimeComponent {
  label: string;
  value: string;
  score: number;
  detail: string;
}

export interface RegimeAxis {
  id: "growth" | "inflation" | "liquidity" | "risk";
  label: string;
  score: number;
  state: "favorable" | "neutral" | "caution";
  summary: string;
  components: RegimeComponent[];
}

export interface RelativeStrengthSignal {
  id: string;
  label: string;
  numerator: string;
  denominator: string;
  current: number;
  oneMonth: number | null;
  threeMonths: number | null;
  sixMonths: number | null;
  above50Day: boolean | null;
  score: number;
  state: "leading" | "neutral" | "lagging";
  meaning: string;
  points: MarketPoint[];
}

export interface MarketRegime {
  score: number;
  label: string;
  summary: string;
  axes: RegimeAxis[];
  relatives: RelativeStrengthSignal[];
  netLiquidity?: {
    currentBillions: number;
    change13WeeksPercent: number | null;
    note: string;
  };
}

const clamp = (value: number, min = -100, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

function percentageChange(current: number, previous: number | undefined): number | null {
  return previous === undefined || previous === 0 ? null : ((current / previous) - 1) * 100;
}

function pointAgo<T extends { value: number }>(points: T[], periods: number): number | undefined {
  return points.at(-(periods + 1))?.value;
}

function yoy(series: MacroSeries | undefined): number | null {
  if (!series || series.points.length < 13) return null;
  return percentageChange(series.current, series.points.at(-13)?.value);
}

function axis(id: RegimeAxis["id"], label: string, components: RegimeComponent[]): RegimeAxis {
  const score = components.length ? Math.round(components.reduce((sum, item) => sum + item.score, 0) / components.length) : 0;
  const state = score >= 25 ? "favorable" : score <= -25 ? "caution" : "neutral";
  const summaries: Record<RegimeAxis["id"], Record<RegimeAxis["state"], string>> = {
    growth: { favorable: "실물 경기 모멘텀이 위험자산을 지지합니다.", neutral: "성장 신호가 엇갈려 방향 확인이 필요합니다.", caution: "고용·생산·소비 둔화 신호가 우세합니다." },
    inflation: { favorable: "물가 기대와 기조 물가가 비교적 안정적입니다.", neutral: "물가가 목표보다 높거나 방향이 엇갈립니다.", caution: "물가 재가속 또는 디플레이션 위험을 경계할 구간입니다." },
    liquidity: { favorable: "금융여건과 유동성이 위험자산에 우호적입니다.", neutral: "유동성 신호가 서로 상쇄되고 있습니다.", caution: "신용·금융여건의 긴축 압력이 높습니다." },
    risk: { favorable: "시장 내부의 위험선호가 확산되는 흐름입니다.", neutral: "위험선호와 방어 신호가 혼재합니다.", caution: "변동성과 방어적 흐름이 우세합니다." },
  };
  return { id, label, score, state, summary: summaries[id][state], components };
}

function ratioPoints(numerator: MarketSeries, denominator: MarketSeries): MarketPoint[] {
  const denominatorByDate = new Map(denominator.points.map((point) => [point.date, point.value]));
  return numerator.points.flatMap((point) => {
    const divisor = denominatorByDate.get(point.date);
    return divisor && Number.isFinite(divisor) ? [{ date: point.date, value: point.value / divisor }] : [];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function relativeSignal(
  marketBySymbol: Map<string, MarketSeries>,
  id: string,
  label: string,
  numeratorSymbol: string,
  denominatorSymbol: string,
  meaning: string,
): RelativeStrengthSignal | null {
  const numerator = marketBySymbol.get(numeratorSymbol);
  const denominator = marketBySymbol.get(denominatorSymbol);
  if (!numerator || !denominator) return null;
  const points = ratioPoints(numerator, denominator);
  if (points.length < 22) return null;
  const current = points.at(-1)!.value;
  const change = (periods: number) => percentageChange(current, pointAgo(points, periods));
  const oneMonth = change(21);
  const threeMonths = change(63);
  const sixMonths = change(126);
  const recent50 = points.slice(-50);
  const movingAverage = recent50.length >= 30 ? recent50.reduce((sum, point) => sum + point.value, 0) / recent50.length : null;
  const above50Day = movingAverage === null ? null : current >= movingAverage;
  const score = clamp((oneMonth ?? 0) * 8 + (threeMonths ?? 0) * 4 + (above50Day === true ? 18 : above50Day === false ? -18 : 0));
  return {
    id,
    label,
    numerator: numeratorSymbol,
    denominator: denominatorSymbol,
    current,
    oneMonth: oneMonth === null ? null : round(oneMonth, 2),
    threeMonths: threeMonths === null ? null : round(threeMonths, 2),
    sixMonths: sixMonths === null ? null : round(sixMonths, 2),
    above50Day,
    score: Math.round(score),
    state: score >= 20 ? "leading" : score <= -20 ? "lagging" : "neutral",
    meaning,
    points,
  };
}

function component(label: string, value: string, score: number, detail: string): RegimeComponent {
  return { label, value, score: Math.round(clamp(score)), detail };
}

export function buildMarketRegime(snapshot: DashboardSnapshot): MarketRegime {
  const macro = new Map(snapshot.macro.map((series) => [series.id, series]));
  const marketSeries = snapshot.market ? [...snapshot.market.series, ...snapshot.market.countryEtfs] : [];
  const marketBySymbol = new Map(marketSeries.map((series) => [series.symbol, series]));

  const growthComponents: RegimeComponent[] = [];
  const unemployment = macro.get("UNRATE");
  if (unemployment?.points.length) {
    const averages = unemployment.points.slice(-15).map((_, index, values) => index < 2 ? null : (values[index].value + values[index - 1].value + values[index - 2].value) / 3).filter((value): value is number => value !== null);
    const gap = averages.length ? averages.at(-1)! - Math.min(...averages.slice(-13)) : 0;
    growthComponents.push(component("실업률", `${unemployment.current.toFixed(1)}%`, 45 - gap * 180, `Sahm식 격차 ${gap.toFixed(2)}%p`));
  }
  const claims = macro.get("ICSA");
  if (claims?.points.length) {
    const change = percentageChange(claims.current, pointAgo(claims.points, 26));
    growthComponents.push(component("신규 실업수당", claims.current.toLocaleString("ko-KR"), -(change ?? 0) * 3, `약 6개월 대비 ${change === null ? "계산 불가" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}`));
  }
  for (const [id, label] of [["INDPRO", "산업생산"], ["RSAFS", "소매판매"]] as const) {
    const series = macro.get(id);
    const growth = yoy(series);
    if (series && growth !== null) growthComponents.push(component(label, `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% YoY`, growth * 18, "전년 대비 모멘텀"));
  }

  const inflationComponents: RegimeComponent[] = [];
  for (const [id, label] of [["PCEPILFE", "근원 PCE"], ["CPIAUCSL", "CPI"]] as const) {
    const series = macro.get(id);
    const growth = yoy(series);
    if (series && growth !== null) inflationComponents.push(component(label, `${growth.toFixed(1)}% YoY`, 70 - Math.abs(growth - 2) * 45, "2%와의 거리 및 방향"));
  }
  for (const [id, label] of [["T10YIE", "10년 기대물가"], ["T5YIFR", "5Y5Y 기대물가"]] as const) {
    const series = macro.get(id);
    if (series) inflationComponents.push(component(label, `${series.current.toFixed(2)}%`, 75 - Math.abs(series.current - 2.2) * 80, "장기 기대의 고정 여부"));
  }

  const liquidityComponents: RegimeComponent[] = [];
  const nfci = macro.get("NFCI");
  if (nfci) liquidityComponents.push(component("NFCI", nfci.current.toFixed(2), -nfci.current * 110, "0보다 낮을수록 평균보다 완화적"));
  const credit = macro.get("BAMLH0A0HYM2");
  if (credit) liquidityComponents.push(component("하이일드 OAS", `${credit.current.toFixed(2)}%p`, 90 - credit.current * 25, "낮고 안정적일수록 신용환경 우호"));
  const walcl = macro.get("WALCL");
  if (walcl) {
    const change = percentageChange(walcl.current, pointAgo(walcl.points, 13));
    liquidityComponents.push(component("연준 총자산", change === null ? "-" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`, (change ?? 0) * 25, "약 13주 변화"));
  }

  const relatives = [
    relativeSignal(marketBySymbol, "breadth", "시장 폭", "RSP", "SPY", "동일가중이 대형주 중심 지수를 앞서면 상승 참여가 넓어집니다."),
    relativeSignal(marketBySymbol, "small_cap", "소형주 위험선호", "IWM", "SPY", "소형주의 상대강도는 경기·금융여건에 민감합니다."),
    relativeSignal(marketBySymbol, "semiconductor", "반도체 주도력", "SOXX", "SPY", "반도체가 시장을 주도하는지 확인합니다."),
    relativeSignal(marketBySymbol, "credit", "신용 위험선호", "HYG", "IEF", "하이일드채가 국채를 앞서면 신용 위험선호가 개선된 흐름입니다."),
    relativeSignal(marketBySymbol, "cyclical", "경기민감 소비", "XLY", "XLP", "경기소비재가 필수소비재를 앞서면 경기 기대가 강한 편입니다."),
  ].filter((value): value is RelativeStrengthSignal => Boolean(value));

  const riskComponents: RegimeComponent[] = [];
  const fearGreed = macro.get("CNN_FEAR_GREED");
  if (fearGreed) riskComponents.push(component("공포·탐욕", fearGreed.current.toFixed(0), (fearGreed.current - 50) * 2, "50 중립 기준"));
  const vix = macro.get("VIXCLS");
  if (vix) riskComponents.push(component("VIX", vix.current.toFixed(1), 85 - vix.current * 5, "20·30 위험 구간 기준"));
  for (const signal of relatives) riskComponents.push(component(signal.label, `${signal.threeMonths === null ? "-" : `${signal.threeMonths >= 0 ? "+" : ""}${signal.threeMonths.toFixed(1)}%`}`, signal.score, `${signal.numerator}/${signal.denominator} 3개월`));

  const axes = [
    axis("growth", "성장", growthComponents),
    axis("inflation", "물가 안정", inflationComponents),
    axis("liquidity", "유동성·신용", liquidityComponents),
    axis("risk", "위험선호", riskComponents),
  ];
  const score = Math.round(axes.reduce((sum, item) => sum + item.score, 0) / axes.length);
  const label = score >= 35 ? "위험선호 우위" : score >= 10 ? "완만한 위험선호" : score > -10 ? "중립·혼조" : score > -35 ? "방어 우위" : "강한 위험회피";
  const strongest = axes.slice().sort((left, right) => right.score - left.score)[0];
  const weakest = axes.slice().sort((left, right) => left.score - right.score)[0];

  const tga = macro.get("WTREGEN");
  const rrp = macro.get("RRPONTSYD");
  let netLiquidity: MarketRegime["netLiquidity"];
  if (walcl && tga && rrp) {
    const current = walcl.current / 1000 - tga.current / 1000 - rrp.current;
    const previous = (pointAgo(walcl.points, 13) ?? walcl.current) / 1000
      - (pointAgo(tga.points, 13) ?? tga.current) / 1000
      - (pointAgo(rrp.points, 65) ?? rrp.current);
    netLiquidity = {
      currentBillions: round(current, 1),
      change13WeeksPercent: previous === 0 ? null : round(((current / previous) - 1) * 100, 2),
      note: "연준 총자산 − TGA − 역레포로 계산한 시장 관행상 근사치이며 공식 인과 지표가 아닙니다.",
    };
  }

  return {
    score,
    label,
    summary: `${strongest.label}이 가장 우호적이고 ${weakest.label}이 가장 약합니다. 단일 점수보다 네 축의 방향과 변화 속도를 함께 보세요.`,
    axes,
    relatives,
    netLiquidity,
  };
}

export interface MarketTechnicalSnapshot {
  oneMonth: number | null;
  threeMonths: number | null;
  sixMonths: number | null;
  oneYear: number | null;
  realizedVolatility20D: number | null;
  above50Day: boolean | null;
  above200Day: boolean | null;
  distanceFrom52WeekHigh: number | null;
}

export function marketTechnicals(series: MarketSeries): MarketTechnicalSnapshot {
  const points = series.points;
  const current = series.current;
  const change = (periods: number) => {
    const value = percentageChange(current, pointAgo(points, periods));
    return value === null ? null : round(value, 2);
  };
  const movingAverage = (periods: number) => {
    const values = points.slice(-periods);
    return values.length < Math.min(periods, 30) ? null : values.reduce((sum, point) => sum + point.value, 0) / values.length;
  };
  const returns = points.slice(-21).flatMap((point, index, values) => index === 0 || values[index - 1].value === 0 ? [] : [Math.log(point.value / values[index - 1].value)]);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1) : 0;
  const yearValues = points.slice(-252).map((point) => point.value);
  const high = yearValues.length ? Math.max(...yearValues) : null;
  const ma50 = movingAverage(50);
  const ma200 = movingAverage(200);
  return {
    oneMonth: change(21),
    threeMonths: change(63),
    sixMonths: change(126),
    oneYear: change(252),
    realizedVolatility20D: returns.length > 5 ? round(Math.sqrt(variance) * Math.sqrt(252) * 100, 1) : null,
    above50Day: ma50 === null ? null : current >= ma50,
    above200Day: ma200 === null ? null : current >= ma200,
    distanceFrom52WeekHigh: high === null || high === 0 ? null : round(((current / high) - 1) * 100, 2),
  };
}
