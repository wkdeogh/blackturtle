import { MarketDataSubnav } from "@/components/market-data-subnav";
import { RefreshMetricsPanel } from "@/components/refresh-metrics-panel";
import { ResearchDashboard } from "@/components/research-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getInvestorResearchState, getRefreshMetrics } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [research, metrics] = await Promise.all([getInvestorResearchState(), getRefreshMetrics()]);
  return <main className="dashboard-page"><SiteHeader /><div className="page-shell dashboard-content"><MarketDataSubnav />
    <section className="dashboard-hero compact-hero"><div><p className="kicker">EVENTS & POSITIONING</p><h1>일정·수급</h1><p className="hero-copy">가격만으로 보이지 않는 다음 촉매와 포지션 혼잡도를 확인합니다. 경제 일정, 관심종목 실적·SEC 공시, EIA 원유 수급, CFTC 선물 포지셔닝을 모았습니다.</p></div><div className="refresh-panel"><span>REFRESH SOURCE</span><strong>매크로 + 시장지수</strong><p className="hero-side-note">경제·수급은 매크로 갱신, 종목 공시·실적은 시장지수 갱신에 포함됩니다.</p></div></section>
    {!research.migrationReady ? <aside className="setup-alert"><div><span className="alert-dot" /><strong>리서치 migration이 필요합니다</strong></div><p><code>202608190014_investor_research.sql</code>을 실행하세요.</p></aside> : <><ResearchDashboard macro={research.macro} market={research.market} /><RefreshMetricsPanel records={metrics.records} migrationReady={metrics.migrationReady} /></>}
  </div><SiteFooter /></main>;
}
