"use client";

import { useMemo, useState } from "react";
import { useChartScrubber } from "@/components/use-chart-scrubber";
import type { MarketSeries } from "@/lib/types";

type ChartRange = "6M" | "1Y" | "3Y";

const COLORS = ["#58bd91", "#e29a49", "#6d9fe8", "#bd7ad1"];

function cutoffDate(lastDate: string, range: ChartRange): string {
  const date = new Date(`${lastDate}T00:00:00Z`);
  if (range === "6M") date.setUTCMonth(date.getUTCMonth() - 6);
  else date.setUTCFullYear(date.getUTCFullYear() - (range === "1Y" ? 1 : 3));
  return date.toISOString().slice(0, 10);
}

function tooltipAlignment(percent: number): string {
  if (percent < 18) return "align-left";
  if (percent > 82) return "align-right";
  return "";
}

function nearestPoint<T extends { date: string }>(points: T[], targetTime: number): T {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(`${points[middle].date}T00:00:00Z`) < targetTime) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return points[0];
  const before = points[low - 1];
  const after = points[low];
  return targetTime - Date.parse(`${before.date}T00:00:00Z`) <= Date.parse(`${after.date}T00:00:00Z`) - targetTime ? before : after;
}

export function CountryEtfChart({ series }: { series: MarketSeries[] }) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const normalized = useMemo(() => series.map((item) => {
    const lastDate = item.points.at(-1)?.date;
    const visible = lastDate ? item.points.filter((point) => point.date >= cutoffDate(lastDate, range)) : [];
    const base = visible[0]?.value;
    const points = base ? visible.map((point) => ({ date: point.date, value: (point.value / base) * 100, originalValue: point.value })) : [];
    return { item, points, returnPercent: points.length ? points.at(-1)!.value - 100 : null };
  }).filter((item) => item.points.length > 1), [range, series]);
  const scrubber = useChartScrubber(1001);

  if (!normalized.length) return <div className="market-chart-empty">비교할 국가 ETF 데이터가 없습니다.</div>;

  const width = 960;
  const height = 330;
  const plotTop = 12;
  const plotBottom = 288;
  const allPoints = normalized.flatMap((item) => item.points);
  const values = allPoints.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || 1;
  const min = rawMin - span * .08;
  const max = rawMax + span * .08;
  const firstDate = allPoints.reduce((value, point) => point.date < value ? point.date : value, allPoints[0].date);
  const lastDate = allPoints.reduce((value, point) => point.date > value ? point.date : value, allPoints[0].date);
  const firstTime = new Date(`${firstDate}T00:00:00Z`).getTime();
  const timeSpan = Math.max(new Date(`${lastDate}T00:00:00Z`).getTime() - firstTime, 1);
  const paths = normalized.map(({ points }, index) => ({
    color: COLORS[index % COLORS.length],
    path: points.map((point, pointIndex) => {
      const x = ((new Date(`${point.date}T00:00:00Z`).getTime() - firstTime) / timeSpan) * width;
      const y = plotTop + ((max - point.value) / (max - min)) * (plotBottom - plotTop);
      return `${pointIndex ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" "),
  }));
  const middleDate = new Date(firstTime + timeSpan / 2).toISOString().slice(0, 10);
  const selectedRatio = scrubber.activeIndex === null ? null : scrubber.activeIndex / 1000;
  const selectedTime = selectedRatio === null ? null : firstTime + timeSpan * selectedRatio;
  const selectedValues = selectedTime === null ? [] : normalized.map(({ item, points }, index) => ({
    color: COLORS[index % COLORS.length],
    item,
    point: nearestPoint(points, selectedTime),
  }));

  return (
    <div className="country-chart">
      <div className="country-chart-tools">
        <div className="market-range-tabs" aria-label="비교 차트 기간">{(["6M", "1Y", "3Y"] as ChartRange[]).map((item) => <button className={range === item ? "active" : ""} type="button" onClick={() => { scrubber.clear(); setRange(item); }} key={item}>{item}</button>)}</div>
        <div className="country-legend">{normalized.map(({ item, returnPercent }, index) => <span key={item.id}><i style={{ backgroundColor: COLORS[index % COLORS.length] }} />{item.label} <b className={(returnPercent ?? 0) >= 0 ? "up" : "down"}>{returnPercent === null ? "-" : `${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(1)}%`}</b></span>)}</div>
      </div>
      <div className="country-chart-frame range-swap" key={range}>
        <div className="market-chart-axis" aria-hidden="true"><span>{rawMax.toFixed(0)}</span><span>{((rawMax + rawMin) / 2).toFixed(0)}</span><span>{rawMin.toFixed(0)}</span></div>
        <div className="chart-interactive-plot">
          <svg className="interactive-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" tabIndex={0} aria-label={`${range} 국가 ETF 가격 비교. 각 시작일을 100으로 환산. 길게 터치하거나 방향키로 날짜별 값을 확인할 수 있습니다.`} {...scrubber.handlers}>
            <line className="market-grid-line" x1="0" x2={width} y1={plotTop} y2={plotTop} />
            <line className="market-grid-line" x1="0" x2={width} y1={(plotTop + plotBottom) / 2} y2={(plotTop + plotBottom) / 2} />
            <line className="market-grid-line" x1="0" x2={width} y1={plotBottom} y2={plotBottom} />
            {paths.map((item, index) => <path d={item.path} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" key={normalized[index].item.id} />)}
            {selectedRatio !== null ? <line className="chart-scrub-line" x1={selectedRatio * width} x2={selectedRatio * width} y1={plotTop} y2={plotBottom} /> : null}
          </svg>
          {selectedRatio !== null && selectedValues.length ? <output className={`chart-detail country-detail ${tooltipAlignment(selectedRatio * 100)}`} style={{ left: `${selectedRatio * 100}%` }}><time dateTime={selectedValues[0].point.date}>{selectedValues[0].point.date}</time>{selectedValues.map(({ color, item, point }) => <span key={item.id}><i style={{ backgroundColor: color }} /><b>{item.label}</b><em>{point.originalValue.toFixed(item.decimals)} {item.currency} · {(point.value - 100) >= 0 ? "+" : ""}{(point.value - 100).toFixed(1)}%</em></span>)}</output> : null}
        </div>
      </div>
      <div className="market-chart-dates"><time dateTime={firstDate}>{firstDate}</time><time dateTime={middleDate}>{middleDate}</time><time dateTime={lastDate}>{lastDate}</time></div>
      <p className="chart-touch-hint">길게 터치하거나 마우스를 올려 날짜별 값 확인</p>
      <p className="country-chart-note">선택 구간의 첫 거래일을 100으로 환산했습니다. 환율과 ETF 운용비용이 포함된 달러 기준 비교입니다.</p>
    </div>
  );
}
