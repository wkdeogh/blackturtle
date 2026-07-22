import type { MacroSeries } from "@/lib/types";

function formatAxisValue(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1000) return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: absolute < 10 ? 2 : 1 }).format(value);
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
  const sentimentGradientId = `sentiment-gradient-${series.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <div className={`macro-line-chart ${tone}`}>
      <div className="macro-line-axis" aria-hidden="true"><span>{formatAxisValue(rawMax)}</span><span>{formatAxisValue(rawMin)}</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${series.label} ${first.date}부터 ${last.date}까지 라인 차트`}>
        {tone === "sentiment" ? (
          <defs>
            <linearGradient id={sentimentGradientId} x1="0" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a94c47" />
              <stop offset="25%" stopColor="#a94c47" />
              <stop offset="25%" stopColor="#d87a63" />
              <stop offset="50%" stopColor="#d87a63" />
              <stop offset="50%" stopColor="#4f9273" />
              <stop offset="75%" stopColor="#4f9273" />
              <stop offset="75%" stopColor="#257653" />
              <stop offset="100%" stopColor="#257653" />
            </linearGradient>
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
          style={tone === "sentiment" ? { stroke: `url(#${sentimentGradientId})` } : undefined}
        />
      </svg>
      <div className="macro-line-dates"><time dateTime={first.date}>{first.date}</time><time dateTime={middle.date}>{middle.date}</time><time dateTime={last.date}>{last.date}</time></div>
    </div>
  );
}
