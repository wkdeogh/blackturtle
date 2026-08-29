"use client";

import { useMemo, useState } from "react";
import { useChartScrubber } from "@/components/use-chart-scrubber";
import { marketPointsForRange, type MarketChartRange } from "@/lib/market-chart-range";
import type { MarketPoint } from "@/lib/types";

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

function tooltipAlignment(percent: number): string {
  if (percent < 18) return "align-left";
  if (percent > 82) return "align-right";
  return "";
}

export function MarketChart({ points, decimals, currency, tone = "green", range: controlledRange, onRangeChange }: { points: MarketPoint[]; decimals: number; currency?: string; tone?: "green" | "amber" | "blue"; range?: MarketChartRange; onRangeChange?: (range: MarketChartRange) => void }) {
  const [internalRange, setInternalRange] = useState<MarketChartRange>("1Y");
  const range = controlledRange ?? internalRange;
  const visible = useMemo(() => reducePoints(marketPointsForRange(points, range)), [points, range]);
  const scrubber = useChartScrubber(visible.length);

  function selectRange(nextRange: MarketChartRange) {
    scrubber.clear();
    if (controlledRange === undefined) setInternalRange(nextRange);
    onRangeChange?.(nextRange);
  }

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
  const selectedIndex = scrubber.activeIndex;
  const selectedPoint = selectedIndex === null ? null : coordinates[selectedIndex];
  const selectedPercent = selectedPoint ? (selectedPoint.x / width) * 100 : null;

  return (
    <div className={`market-chart ${tone}`}>
      <div className="market-range-tabs" aria-label="차트 기간">
        {(["6M", "1Y", "3Y"] as MarketChartRange[]).map((item) => (
          <button className={range === item ? "active" : ""} type="button" onClick={() => selectRange(item)} key={item}>{item}</button>
        ))}
      </div>
      <div className="market-chart-frame range-swap" key={range}>
        <div className="market-chart-axis" aria-hidden="true"><span>{axisValue(rawMax, decimals)}</span><span>{axisValue((rawMax + rawMin) / 2, decimals)}</span><span>{axisValue(rawMin, decimals)}</span></div>
        <div className="chart-interactive-plot">
          <svg className="interactive-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" tabIndex={0} aria-label={`${range} 가격 추이. ${first.date} ${first.value}에서 ${last.date} ${last.value}. 길게 터치하거나 방향키로 날짜별 값을 확인할 수 있습니다.`} {...scrubber.handlers}>
            <line className="market-grid-line" x1="0" x2={width} y1={plotTop} y2={plotTop} />
            <line className="market-grid-line" x1="0" x2={width} y1={(plotTop + plotBottom) / 2} y2={(plotTop + plotBottom) / 2} />
            <line className="market-grid-line" x1="0" x2={width} y1={plotBottom} y2={plotBottom} />
            <path className="market-chart-area" d={area} />
            <path className="market-chart-line" d={path} />
            {selectedPoint ? <><line className="chart-scrub-line" x1={selectedPoint.x} x2={selectedPoint.x} y1={plotTop} y2={plotBottom} /><line className="chart-scrub-line horizontal" x1="0" x2={width} y1={selectedPoint.y} y2={selectedPoint.y} /></> : null}
          </svg>
          {selectedPoint && selectedPercent !== null ? <output className={`chart-detail ${tooltipAlignment(selectedPercent)}`} style={{ left: `${selectedPercent}%` }}><time dateTime={selectedPoint.date}>{selectedPoint.date}</time><strong>{new Intl.NumberFormat("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(selectedPoint.value)}{currency ? <small> {currency}</small> : null}</strong></output> : null}
        </div>
      </div>
      <div className="market-chart-dates"><time dateTime={first.date}>{first.date}</time><time dateTime={middle.date}>{middle.date}</time><time dateTime={last.date}>{last.date}</time></div>
      <p className="chart-touch-hint">길게 터치하거나 마우스를 올려 날짜별 값 확인</p>
    </div>
  );
}
