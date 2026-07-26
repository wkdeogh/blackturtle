"use client";

import type { MacroSeries } from "@/lib/types";
import { useChartScrubber } from "@/components/use-chart-scrubber";

function formatAxisValue(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1000) return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: absolute < 10 ? 2 : 1 }).format(value);
}

function gradientOffset(value: number, min: number, range: number): string {
  return `${Math.max(0, Math.min(100, ((value - min) / range) * 100))}%`;
}

function tooltipAlignment(percent: number): string {
  if (percent < 18) return "align-left";
  if (percent > 82) return "align-right";
  return "";
}

export function MacroLineChart({
  series,
  fixedMin,
  fixedMax,
  tone = "default",
}: {
  series: MacroSeries;
  fixedMin?: number;
  fixedMax?: number;
  tone?: "default" | "risk" | "sentiment";
}) {
  const points = series.points;
  const scrubber = useChartScrubber(points.length);
  if (points.length < 2) return <div className="macro-line-empty">추이를 그리기에 관측값이 부족합니다.</div>;

  const values = points.map((point) => point.value);
  const rawMin = fixedMin ?? Math.min(...values);
  const rawMax = fixedMax ?? Math.max(...values);
  const rawRange = rawMax - rawMin || 1;
  const padding = fixedMin === undefined && fixedMax === undefined ? rawRange * 0.08 : 0;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;
  const coordinates = points.map((point, index) => ({
    x: (index / (points.length - 1)) * 100,
    y: 100 - ((point.value - min) / range) * 100,
  }));
  const zeroY = min < 0 && max > 0 ? 100 - ((0 - min) / range) * 100 : null;
  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points.at(-1)!;
  const lineGradientId = `line-gradient-${tone}-${series.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const risk20Offset = gradientOffset(20, min, range);
  const risk30Offset = gradientOffset(30, min, range);
  const selectedIndex = scrubber.activeIndex;
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const selectedCoordinate = selectedIndex === null ? null : coordinates[selectedIndex];

  return (
    <div className={`macro-line-chart ${tone}`}>
      <div className="macro-line-axis" aria-hidden="true"><span>{formatAxisValue(rawMax)}</span><span>{formatAxisValue(rawMin)}</span></div>
      <div className="chart-interactive-plot">
        <svg className="interactive-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" tabIndex={0} aria-label={`${series.label} ${first.date}부터 ${last.date}까지 라인 차트. 길게 터치하거나 방향키로 날짜별 값을 확인할 수 있습니다.`} {...scrubber.handlers}>
          {tone !== "default" ? (
            <defs>
              {tone === "sentiment" ? (
                <linearGradient id={lineGradientId} x1="0" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#a94c47" />
                  <stop offset="25%" stopColor="#a94c47" />
                  <stop offset="25%" stopColor="#d87a63" />
                  <stop offset="45%" stopColor="#d87a63" />
                  <stop offset="45%" stopColor="#737e78" />
                  <stop offset="55%" stopColor="#737e78" />
                  <stop offset="55%" stopColor="#4f9273" />
                  <stop offset="75%" stopColor="#4f9273" />
                  <stop offset="75%" stopColor="#257653" />
                  <stop offset="100%" stopColor="#257653" />
                </linearGradient>
              ) : (
                <linearGradient id={lineGradientId} x1="0" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#4f9273" />
                  <stop offset={risk20Offset} stopColor="#4f9273" />
                  <stop offset={risk20Offset} stopColor="#e38336" />
                  <stop offset={risk30Offset} stopColor="#e38336" />
                  <stop offset={risk30Offset} stopColor="#c6655a" />
                  <stop offset="100%" stopColor="#c6655a" />
                </linearGradient>
              )}
            </defs>
          ) : null}
          <line className="chart-grid-line" x1="0" y1="25" x2="100" y2="25" />
          <line className="chart-grid-line" x1="0" y1="50" x2="100" y2="50" />
          <line className="chart-grid-line" x1="0" y1="75" x2="100" y2="75" />
          {zeroY === null ? null : <line className="chart-zero-line" x1="0" y1={zeroY} x2="100" y2={zeroY} />}
          <polyline
            className="chart-data-line"
            points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
            vectorEffect="non-scaling-stroke"
            style={tone === "default" ? undefined : { stroke: `url(#${lineGradientId})` }}
          />
          {selectedCoordinate ? <><line className="chart-scrub-line" x1={selectedCoordinate.x} x2={selectedCoordinate.x} y1="0" y2="100" /><line className="chart-scrub-line horizontal" x1="0" x2="100" y1={selectedCoordinate.y} y2={selectedCoordinate.y} /></> : null}
        </svg>
        {selectedPoint && selectedCoordinate ? <output className={`chart-detail ${tooltipAlignment(selectedCoordinate.x)}`} style={{ left: `${selectedCoordinate.x}%` }}><time dateTime={selectedPoint.date}>{selectedPoint.date}</time><strong>{new Intl.NumberFormat("ko-KR", { maximumFractionDigits: series.decimals }).format(selectedPoint.value)} <small>{series.unit}</small></strong></output> : null}
      </div>
      <div className="macro-line-dates"><time dateTime={first.date}>{first.date}</time><time dateTime={middle.date}>{middle.date}</time><time dateTime={last.date}>{last.date}</time></div>
      <p className="chart-touch-hint">길게 터치하거나 마우스를 올려 날짜별 값 확인</p>
    </div>
  );
}
