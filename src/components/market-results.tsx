import { CountryEtfChart } from "@/components/country-etf-chart";
import { DeferredRender } from "@/components/deferred-render";
import { MarketCard } from "@/components/market-card";
import { MARKET_CORE_IDS, MARKET_SIGNAL_IDS } from "@/lib/market-data";
import type { MarketSnapshot } from "@/lib/types";

export function MarketResults({ market }: { market: MarketSnapshot }) {
  const core = MARKET_CORE_IDS.flatMap((id) => market.series.find((series) => series.id === id) ?? []);
  const signals = MARKET_SIGNAL_IDS.flatMap((id) => market.series.find((series) => series.id === id) ?? []);
  return (
    <>
      {market.warnings.length ? <aside className="market-warning" role="status"><strong>일부 지수는 이번 갱신에서 제외됐습니다.</strong>{market.warnings.map((warning) => <span key={warning}>{warning}</span>)}</aside> : null}
      <section className="section-block market-section">
        <div className="section-title"><div><p className="kicker">MARKET PRICES</p><h2>주요 시장</h2></div><p>낙폭은 각 차트의 선택 기간 종가 고점 기준 · {market.provider}</p></div>
        <div className="market-grid stagger-grid">{core.map((series) => <MarketCard series={series} provider={market.provider} key={series.id} />)}</div>
      </section>
      {signals.length ? <details className="market-signal-details"><summary><div><p className="kicker">MARKET INTERNAL INPUTS</p><strong>시장 폭·신용·경기민감 원자료</strong><small>RSP · IWM · HYG · IEF · LQD · XLY · XLP</small></div><span>펼쳐보기</span></summary><div className="market-grid stagger-grid">{signals.map((series) => <MarketCard series={series} provider={market.provider} key={series.id} />)}</div></details> : null}
      <section className="section-block country-section">
        <div className="section-title"><div><p className="kicker">COUNTRY ETF COMPARISON</p><h2>국가 ETF 비교</h2></div><p>브라질 · 인도 · 베트남 · 일본</p></div>
        <div className="country-chart-card"><DeferredRender className="deferred-chart" minHeight={390}><CountryEtfChart series={market.countryEtfs} /></DeferredRender></div>
      </section>
    </>
  );
}
