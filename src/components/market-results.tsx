import { CountryEtfChart } from "@/components/country-etf-chart";
import { MarketChart } from "@/components/market-chart";
import type { MarketSnapshot, MarketSeries } from "@/lib/types";

function formatPrice(series: MarketSeries, value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: series.decimals,
    maximumFractionDigits: series.decimals,
  }).format(value);
}

function instrumentLabel(series: MarketSeries): string {
  return series.instrumentType === "index" ? "실제 지수" : series.instrumentType === "etf" ? "ETF" : series.instrumentType === "forex" ? "환율" : "암호화폐";
}

function chartTone(series: MarketSeries): "green" | "amber" | "blue" {
  if (series.id === "gold") return "amber";
  if (series.id === "bitcoin" || series.id === "usdkrw") return "blue";
  return "green";
}

function MarketCard({ series, provider }: { series: MarketSeries; provider: MarketSnapshot["provider"] }) {
  const drawdown = Math.min(series.drawdownPercent, 0);
  return (
    <article className="market-card">
      <header className="market-card-head">
        <div><span className="data-tag">{instrumentLabel(series)} · {series.symbol} · {series.interval === "daily" ? "일간" : "주간"}</span><h3>{series.label}</h3></div>
        <time dateTime={series.observationDate}>{series.observationDate}</time>
      </header>
      <div className="market-price-row"><strong>{formatPrice(series, series.current)}</strong><span>{series.currency}</span></div>
      <div className="market-stat-row">
        <div><span>{series.interval === "daily" ? "전일 대비" : "전주 대비"}</span><b className={(series.changePercent ?? 0) >= 0 ? "up" : "down"}>{series.changePercent === null ? "-" : `${series.changePercent >= 0 ? "+" : ""}${series.changePercent.toFixed(2)}%`}</b></div>
        <div><span>최근 3년 고점 대비</span><b className={drawdown < -10 ? "down" : ""}>{drawdown.toFixed(2)}%</b></div>
      </div>
      <MarketChart points={series.points} decimals={series.decimals} tone={chartTone(series)} />
      <footer className="market-card-foot">
        <span>종가 고점 {formatPrice(series, series.peakValue)} · {series.peakDate}</span>
        <span>{series.benchmark ? `${series.benchmark} · ${provider}` : provider}</span>
      </footer>
    </article>
  );
}

export function MarketResults({ market }: { market: MarketSnapshot }) {
  return (
    <>
      {market.warnings.length ? <aside className="market-warning" role="status"><strong>일부 지수는 이번 갱신에서 제외됐습니다.</strong>{market.warnings.map((warning) => <span key={warning}>{warning}</span>)}</aside> : null}
      <section className="section-block market-section">
        <div className="section-title"><div><p className="kicker">MARKET PRICES</p><h2>주요 시장</h2></div><p>낙폭은 최근 3년 종가 고점 기준 · {market.provider}</p></div>
        <div className="market-grid">{market.series.map((series) => <MarketCard series={series} provider={market.provider} key={series.id} />)}</div>
      </section>
      <section className="section-block country-section">
        <div className="section-title"><div><p className="kicker">COUNTRY ETF COMPARISON</p><h2>국가 ETF 비교</h2></div><p>브라질 · 인도 · 베트남 · 일본</p></div>
        <div className="country-chart-card"><CountryEtfChart series={market.countryEtfs} /></div>
      </section>
    </>
  );
}
