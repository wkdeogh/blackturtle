import { RefreshButton } from "@/components/dashboard-actions";
import { MarketResults } from "@/components/market-results";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatDateTime } from "@/lib/format";
import { getLatestRefreshRun, getLatestSnapshot, getMissingConfiguration, getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  let snapshot = null;
  let latestRun = null;
  let databaseError = "";
  try {
    [snapshot, latestRun] = await Promise.all([getLatestSnapshot(), getLatestRefreshRun()]);
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "데이터베이스에 연결하지 못했습니다.";
  }
  const missing = getMissingConfiguration("market");
  const market = snapshot?.payload.market;
  const updatedAt = snapshot?.payload.marketUpdatedAt ?? (market?.series.length ? snapshot?.payload.generatedAt : undefined);

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <section className="dashboard-hero compact-hero">
          <div><p className="kicker">MARKET DATA</p><h1>시장지수</h1><p className="hero-copy">주요 자산과 국가 ETF의 마지막 저장 가격입니다. 페이지 조회는 API를 호출하지 않으며, 버튼을 눌렀을 때만 새 데이터를 가져옵니다.</p></div>
          <div className="refresh-panel"><span>LAST MARKET UPDATE</span><strong>{updatedAt ? formatDateTime(updatedAt) : "아직 없음"}</strong><RefreshButton source="market" initialRun={latestRun} compact /></div>
        </section>

        {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "시장 데이터 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p><p className="setup-help">Alpha Vantage 무료 키 또는 Twelve Data 키와 최신 Supabase migration을 등록한 뒤 재배포하세요.</p></aside> : null}

        {!market?.series.length ? (
          <section className="empty-state"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO MARKET DATA YET</p><h2>아직 저장된 시장 데이터가 없습니다.</h2><p>{getSupabaseAdmin() ? "첫 시장지수 갱신을 실행하면 최근 3년 가격을 저장합니다. Alpha Vantage는 주간, Twelve Data는 일간 시계열을 사용합니다." : "Supabase 연결과 환경 변수를 완료한 뒤 첫 갱신을 실행하세요."}</p><RefreshButton source="market" initialRun={latestRun} /></section>
        ) : <MarketResults market={market} />}
      </div>
      <SiteFooter />
    </main>
  );
}
