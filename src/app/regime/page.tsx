import { MarketDataSubnav } from "@/components/market-data-subnav";
import { RegimeDashboard } from "@/components/regime-dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buildMarketRegime } from "@/lib/market-regime";
import { getLatestSnapshot } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RegimePage() {
  const snapshot = await getLatestSnapshot().catch(() => null);
  const ready = snapshot && snapshot.payload.macro.length && snapshot.payload.market?.series.length;
  return <main className="dashboard-page">
    <SiteHeader />
    <div className="page-shell dashboard-content">
      <MarketDataSubnav />
      <section className="dashboard-hero compact-hero"><div><p className="kicker">MARKET REGIME</p><h1>시장 레짐</h1><p className="hero-copy">성장·물가·유동성·위험선호를 한 화면에서 교차 확인합니다. 모든 점수는 의사결정을 돕는 요약값이며 매매 신호가 아닙니다.</p></div><div className="refresh-panel"><span>HOW TO USE</span><strong>방향과 확산 확인</strong><p className="hero-side-note">종합점수 하나보다 네 축과 상대강도가 같은 방향으로 움직이는지 보세요.</p></div></section>
      {ready ? <RegimeDashboard regime={buildMarketRegime(snapshot.payload)} /> : <section className="empty-state"><div className="empty-orbit"><span>0</span></div><p className="kicker">REGIME DATA PENDING</p><h2>매크로와 시장지수 데이터가 필요합니다.</h2><p>전체 갱신에서 매크로와 시장지수를 선택하면 레짐 분석이 자동 계산됩니다.</p></section>}
    </div>
    <SiteFooter />
  </main>;
}
