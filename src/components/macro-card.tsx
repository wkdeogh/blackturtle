import type { MacroSeries } from "@/lib/types";
import { FRED_GUIDES } from "@/lib/fred";
import { MacroLineChart } from "@/components/macro-line-chart";

function formatValue(value: number, decimals: number): string {
  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function MacroCard({ series }: { series: MacroSeries }) {
  const isUp = (series.change ?? 0) >= 0;
  const guide = FRED_GUIDES[series.id];
  const isWide = series.id === "VIXCLS" || series.id === "T10Y2Y";
  const tone = series.id === "VIXCLS" ? "risk" : "default";

  return (
    <article className={isWide ? "macro-card wide" : "macro-card"}>
      <div className="macro-card-head">
        <div><span className="data-tag">{series.group}</span><h3>{series.label}</h3></div>
        <a className="source-link" href={`https://fred.stlouisfed.org/series/${series.id}`} target="_blank" rel="noreferrer" aria-label={`${series.label} FRED 원문`}>↗</a>
      </div>
      <div className="macro-value-row">
        <strong>{formatValue(series.current, series.decimals)}</strong><span>{series.unit}</span>
      </div>
      <MacroLineChart series={series} tone={tone} />
      <div className="macro-meta">
        <span className={isUp ? "delta up" : "delta down"}>{series.change === null ? "—" : `${isUp ? "+" : ""}${formatValue(series.change, series.decimals)}`}</span>
        <time dateTime={series.observationDate}>{series.observationDate}</time>
      </div>
      {guide ? <div className="macro-guide"><p><b>의미</b>{guide.description}</p><p><b>보는 법</b>{guide.readingGuide}</p></div> : null}
    </article>
  );
}
