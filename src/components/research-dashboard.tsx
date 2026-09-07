import { DataSourceStatusList } from "@/components/data-source-status";
import { MacroLineChart } from "@/components/macro-line-chart";
import { MarketChart } from "@/components/market-chart";
import { InvestorCalendar } from "@/components/investor-calendar";
import { newYorkDate } from "@/lib/investor-view";
import type { MacroResearchPayload, MacroSeries, MarketResearchPayload } from "@/lib/types";

function energyMacro(series: MacroResearchPayload["energy"][number]): MacroSeries {
  return { ...series, group: "원유 수급", decimals: series.unit === "%" ? 1 : 0 };
}

function formatPosition(value: number) {
  return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function ResearchDashboard({ macro, market }: { macro: MacroResearchPayload; market: MarketResearchPayload }) {
  const filings = market.secFilings.slice(0, 30);
  const warnings = [...macro.warnings, ...market.warnings];
  return <>
    <DataSourceStatusList statuses={[...macro.statuses, ...market.statuses.filter((status) => status.source !== "portfolio_prices")]} title="리서치 데이터 상태" />
    {warnings.length ? <aside className="market-warning"><strong>일부 보조 데이터는 이전 값을 유지하거나 제외했습니다.</strong>{warnings.slice(0, 12).map((warning) => <span key={warning}>{warning}</span>)}</aside> : null}

    <InvestorCalendar economicEvents={macro.economicEvents} earningsEvents={market.earningsEvents} today={newYorkDate(new Date())} />

    <section className="section-block">
      <div className="section-title"><div><p className="kicker">ENERGY BALANCE</p><h2>미국 원유 수급</h2></div><p>EIA 주간 데이터 · 재고·생산·정유 가동률을 함께 봅니다.</p></div>
      {!macro.energy.length ? <div className="inline-empty">EIA_API_KEY를 추가한 뒤 매크로 갱신을 실행하면 표시됩니다.</div> : <div className="research-chart-grid stagger-grid">{macro.energy.map((series) => <article className="research-chart-card" key={series.id}><header><div><span>{series.observationDate}</span><h3>{series.label}</h3></div><strong>{new Intl.NumberFormat("ko-KR", { maximumFractionDigits: series.unit === "%" ? 1 : 0 }).format(series.current)}<small>{series.unit}</small></strong></header><p className={(series.change ?? 0) >= 0 ? "up" : "down"}>전주 대비 {series.change === null ? "-" : `${series.change > 0 ? "+" : ""}${series.change.toLocaleString("ko-KR")}`}</p><MacroLineChart series={energyMacro(series)} /></article>)}</div>}
    </section>

    <section className="section-block">
      <div className="section-title"><div><p className="kicker">CFTC COMMITMENTS OF TRADERS</p><h2>선물 포지셔닝</h2></div><p>비상업 순포지션 · 극단값은 추세 반전이 아니라 혼잡도 참고값입니다.</p></div>
      {!macro.positioning.length ? <div className="inline-empty">CFTC 데이터가 아직 없습니다.</div> : <div className="research-chart-grid stagger-grid">{macro.positioning.map((series) => <article className="research-chart-card" key={series.id}><header><div><span>{series.observationDate}</span><h3>{series.label}</h3></div><strong>{formatPosition(series.netNonCommercial)}<small>순계약</small></strong></header><div className="position-stats"><span>미결제 대비 <b>{series.netPercentOfOpenInterest === null ? "-" : `${series.netPercentOfOpenInterest.toFixed(1)}%`}</b></span><span>3년 백분위 <b>{series.percentile3Y === null ? "-" : `${series.percentile3Y}%`}</b></span></div><MarketChart points={series.points.map((point) => ({ date: point.date, value: point.net }))} decimals={0} tone={series.netNonCommercial < 0 ? "amber" : "blue"} /></article>)}</div>}
    </section>

    <section className="section-block">
      <div className="section-title"><div><p className="kicker">COMPANY DISCLOSURES</p><h2>최근 SEC 공시</h2></div><p>보유·관심종목의 8-K, 10-Q, 10-K, Form 4 등</p></div>
      {!filings.length ? <div className="inline-empty">SEC_USER_AGENT와 포트폴리오 종목을 설정하면 공시를 모읍니다.</div> : <div className="filing-list">{filings.map((filing) => <a href={filing.url} target="_blank" rel="noreferrer" key={filing.id}><span className={`filing-form ${filing.importance}`}>{filing.form}</span><div><strong>{filing.ticker}<small>{filing.companyName}</small></strong><span>제출 {filing.filedAt}{filing.reportDate ? ` · 보고기간 ${filing.reportDate}` : ""}</span></div><b aria-hidden="true">↗</b></a>)}</div>}
    </section>
  </>;
}
