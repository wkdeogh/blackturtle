"use client";

import { useMemo, useState } from "react";
import type { MarketSeries } from "@/lib/types";

type ChartRange = "6M" | "1Y" | "3Y";

const COLORS = ["#58bd91", "#e29a49", "#6d9fe8", "#bd7ad1"];

function cutoffDate(lastDate: string, range: ChartRange): string {
  const date = new Date(`${lastDate}T00:00:00Z`);
  if (range === "6M") date.setUTCMonth(date.getUTCMonth() - 6);
  else date.setUTCFullYear(date.getUTCFullYear() - (range === "1Y" ? 1 : 3));
  return date.toISOString().slice(0, 10);
}

export function CountryEtfChart({ series }: { series: MarketSeries[] }) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const normalized = useMemo(() => series.map((item) => {
    const lastDate = item.points.at(-1)?.date;
    const visible = lastDate ? item.points.filter((point) => point.date >= cutoffDate(lastDate, range)) : [];
    const base = visible[0]?.value;
    const points = base ? visible.map((point) => ({ date: point.date, value: (point.value / base) * 100 })) : [];
    return { item, points, returnPercent: points.length ? points.at(-1)!.value - 100 : null };
  }).filter((item) => item.points.length > 1), [range, series]);

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

  return (
    <div className="country-chart">
      <div className="country-chart-tools">
        <div className="market-range-tabs" aria-label="비교 차트 기간">{(["6M", "1Y", "3Y"] as ChartRange[]).map((item) => <button className={range === item ? "active" : ""} type="button" onClick={() => setRange(item)} key={item}>{item}</button>)}</div>
        <div className="country-legend">{normalized.map(({ item, returnPercent }, index) => <span key={item.id}><i style={{ backgroundColor: COLORS[index % COLORS.length] }} />{item.label} <b className={(returnPercent ?? 0) >= 0 ? "up" : "down"}>{returnPercent === null ? "-" : `${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(1)}%`}</b></span>)}</div>
      </div>
      <div className="country-chart-frame">
        <div className="market-chart-axis" aria-hidden="true"><span>{rawMax.toFixed(0)}</span><span>{((rawMax + rawMin) / 2).toFixed(0)}</span><span>{rawMin.toFixed(0)}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${range} 국가 ETF 가격 비교. 각 시작일을 100으로 환산`}>
          <line className="market-grid-line" x1="0" x2={width} y1={plotTop} y2={plotTop} />
          <line className="market-grid-line" x1="0" x2={width} y1={(plotTop + plotBottom) / 2} y2={(plotTop + plotBottom) / 2} />
          <line className="market-grid-line" x1="0" x2={width} y1={plotBottom} y2={plotBottom} />
          {paths.map((item, index) => <path d={item.path} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" key={normalized[index].item.id} />)}
        </svg>
      </div>
      <div className="market-chart-dates"><time dateTime={firstDate}>{firstDate}</time><time dateTime={middleDate}>{middleDate}</time><time dateTime={lastDate}>{lastDate}</time></div>
      <p className="country-chart-note">선택 구간의 첫 거래일을 100으로 환산했습니다. 환율과 ETF 운용비용이 포함된 달러 기준 비교입니다.</p>
    </div>
  );
}
