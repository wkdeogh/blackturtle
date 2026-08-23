import { RefreshButton } from "@/components/dashboard-actions";
import { DataSourceStatusList } from "@/components/data-source-status";
import { MarketCapDashboard } from "@/components/market-cap-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatDateTime } from "@/lib/format";
import { getInvestorResearchState, getLatestRefreshRun } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MarketCapPage() {
  let research = null;
  let latestRun = null;
  let databaseError = "";
  const [researchResult, runResult] = await Promise.allSettled([getInvestorResearchState(), getLatestRefreshRun()]);
  if (researchResult.status === "fulfilled") research = researchResult.value;
  else databaseError = researchResult.reason instanceof Error ? researchResult.reason.message : "데이터베이스에 연결하지 못했습니다.";
  if (runResult.status === "fulfilled") latestRun = runResult.value;
  else if (!databaseError) databaseError = runResult.reason instanceof Error ? runResult.reason.message : "갱신 상태를 확인하지 못했습니다.";
  const snapshot = research?.market.marketCapitalization ?? null;
  const status = research?.market.statuses.find((item) => item.source === "nasdaq_market_cap");

  return <main className="dashboard-page"><SiteHeader /><div className="page-shell dashboard-content">
    <section className="dashboard-hero compact-hero">
      <div><p className="kicker">US MARKET CAPITALIZATION</p><h1>시가총액</h1><p className="hero-copy">미국 거래소 상장 기업을 시가총액 순으로 봅니다. TOP 100·200 전환, 기업 검색과 섹터 필터를 지원하며 페이지를 여는 것만으로 외부 API를 호출하지 않습니다.</p></div>
      <div className="refresh-panel"><span>LAST MARKET CAP UPDATE</span><strong>{snapshot?.updatedAt ? formatDateTime(snapshot.updatedAt) : "아직 없음"}</strong><RefreshButton source="market" initialRun={latestRun} compact /><p className="hero-side-note">무료 Nasdaq 데이터는 시장지수 갱신과 함께 저장됩니다.</p></div>
    </section>

    {databaseError || !research?.migrationReady ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "리서치 migration이 필요합니다"}</strong></div><p>{databaseError || "Supabase에서 202608190014_investor_research.sql을 실행하세요."}</p></aside> : null}
    {status ? <DataSourceStatusList statuses={[status]} title="시가총액 데이터 상태" /> : null}
    {!snapshot?.items.length ? <section className="empty-state"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO MARKET CAP DATA YET</p><h2>아직 저장된 시가총액 순위가 없습니다.</h2><p>시장지수 갱신을 한 번 실행하면 무료 Nasdaq Screener 데이터에서 상위 200개 기업을 저장합니다.</p><RefreshButton source="market" initialRun={latestRun} /></section> : <MarketCapDashboard snapshot={snapshot} />}
  </div><SiteFooter /></main>;
}
