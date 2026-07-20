import type { MacroSeries } from "@/lib/types";
import { FRED_GUIDES } from "@/lib/fred";

function formatValue(value: number, decimals: number): string {
  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function MacroCard({ series }: { series: MacroSeries }) {
  const values = series.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const isUp = (series.change ?? 0) >= 0;
  const guide = FRED_GUIDES[series.id];
  const points = series.points.slice(-10);

  return (
    <article className="macro-card">
      <div className="macro-card-head">
        <div><span className="data-tag">{series.group}</span><h3>{series.label}</h3></div>
        <a className="source-link" href={`https://fred.stlouisfed.org/series/${series.id}`} target="_blank" rel="noreferrer" aria-label={`${series.label} FRED 원문`}>↗</a>
      </div>
      <div className="macro-value-row">
        <strong>{formatValue(series.current, series.decimals)}</strong><span>{series.unit}</span>
      </div>
      <div className="dated-chart" aria-label={`${series.label} 최근 추이. 각 막대 아래에 관측일 표시`}>
        {points.map((point) => (
          <div className="chart-point" key={point.date} title={`${point.date}: ${point.value}`}>
            <span className="chart-bar-wrap"><i style={{ height: `${18 + ((point.value - min) / range) * 82}%` }} /></span>
            <time dateTime={point.date}>{point.date.slice(2).replaceAll("-", ".")}</time>
          </div>
        ))}
      </div>
      <div className="macro-meta">
        <span className={isUp ? "delta up" : "delta down"}>{series.change === null ? "—" : `${isUp ? "+" : ""}${formatValue(series.change, series.decimals)}`}</span>
        <time dateTime={series.observationDate}>{series.observationDate}</time>
      </div>
      {guide ? <div className="macro-guide"><p><b>의미</b>{guide.description}</p><p><b>보는 법</b>{guide.readingGuide}</p></div> : null}
    </article>
  );
}
