"use client";

import { useMemo, useState } from "react";
import type { MarketPoint } from "@/lib/types";

type ChartRange = "6M" | "1Y" | "3Y";

function cutoffDate(lastDate: string, range: ChartRange): string {
  const date = new Date(`${lastDate}T00:00:00Z`);
  if (range === "6M") date.setUTCMonth(date.getUTCMonth() - 6);
  else date.setUTCFullYear(date.getUTCFullYear() - (range === "1Y" ? 1 : 3));
  return date.toISOString().slice(0, 10);
}

function reducePoints(points: MarketPoint[], maximum = 220): MarketPoint[] {
  if (points.length <= maximum) return points;
  const step = (points.length - 1) / (maximum - 1);
  return Array.from({ length: maximum }, (_, index) => points[Math.round(index * step)]);
}

function axisValue(value: number, decimals: number): string {
  return new Intl.NumberFormat("ko-KR", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: decimals,
  }).format(value);
}

export function MarketChart({ points, decimals, tone = "green" }: { points: MarketPoint[]; decimals: number; tone?: "green" | "amber" | "blue" }) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const visible = useMemo(() => {
    const last = points.at(-1);
    if (!last) return [];
    return reducePoints(points.filter((point) => point.date >= cutoffDate(last.date, range)));
  }, [points, range]);

  if (visible.length < 2) return <div className="market-chart-empty">선택 구간의 데이터가 부족합니다.</div>;

  const width = 720;
  const height = 230;
  const plotTop = 12;
  const plotBottom = 196;
  const values = visible.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax) * .02, 1);
  const min = rawMin - span * .08;
  const max = rawMax + span * .08;
  const coordinates = visible.map((point, index) => ({
    ...point,
    x: (index / (visible.length - 1)) * width,
    y: plotTop + ((max - point.value) / (max - min)) * (plotBottom - plotTop),
  }));
  const path = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${path} L${width},${plotBottom} L0,${plotBottom} Z`;
  const first = visible[0];
  const middle = visible[Math.floor(visible.length / 2)];
  const last = visible.at(-1)!;

  return (
    <div className={`market-chart ${tone}`}>
      <div className="market-range-tabs" aria-label="차트 기간">
        {(["6M", "1Y", "3Y"] as ChartRange[]).map((item) => (
          <button className={range === item ? "active" : ""} type="button" onClick={() => setRange(item)} key={item}>{item}</button>
        ))}
      </div>
      <div className="market-chart-frame">
        <div className="market-chart-axis" aria-hidden="true"><span>{axisValue(rawMax, decimals)}</span><span>{axisValue((rawMax + rawMin) / 2, decimals)}</span><span>{axisValue(rawMin, decimals)}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${range} 가격 추이. ${first.date} ${first.value}에서 ${last.date} ${last.value}`}>
          <line className="market-grid-line" x1="0" x2={width} y1={plotTop} y2={plotTop} />
          <line className="market-grid-line" x1="0" x2={width} y1={(plotTop + plotBottom) / 2} y2={(plotTop + plotBottom) / 2} />
          <line className="market-grid-line" x1="0" x2={width} y1={plotBottom} y2={plotBottom} />
          <path className="market-chart-area" d={area} />
          <path className="market-chart-line" d={path} />
        </svg>
      </div>
      <div className="market-chart-dates"><time dateTime={first.date}>{first.date}</time><time dateTime={middle.date}>{middle.date}</time><time dateTime={last.date}>{last.date}</time></div>
    </div>
  );
}
