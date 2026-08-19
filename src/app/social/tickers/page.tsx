import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SocialResults } from "@/components/social-results";
import { SocialSubnav } from "@/components/social-subnav";
import { XCollectionPanel } from "@/components/x-collection-panel";
import { XTickerSettings } from "@/components/x-ticker-settings";
import { formatDateTime } from "@/lib/format";
import { getLatestRefreshRun, getLatestSnapshot, getMissingConfiguration, getXTickerMonitorSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TickerMonitoringPage() {
  const fallback = { tickers: [], activeTickers: [], lookbackDays: 1, perTickerPostLimit: 20, totalPostLimit: 50, migrationReady: false };
  const [snapshotResult, settingsResult, runResult] = await Promise.allSettled([getLatestSnapshot(), getXTickerMonitorSettings(), getLatestRefreshRun()]);
  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : fallback;
  const latestRun = runResult.status === "fulfilled" ? runResult.value : null;
  const databaseError = snapshotResult.status === "rejected" ? String(snapshotResult.reason) : settingsResult.status === "rejected" ? String(settingsResult.reason) : runResult.status === "rejected" ? String(runResult.reason) : "";
  const missing = getMissingConfiguration("social");
  const tickerPosts = snapshot?.payload.social.posts.filter((post) => post.source === "ticker" || Boolean(post.matchedTickers?.length)) ?? [];
  const collectedAt = snapshot?.payload.socialTickerCollectedAt ?? (tickerPosts.length ? snapshot?.payload.socialCollectedAt ?? snapshot?.payload.socialUpdatedAt ?? snapshot?.payload.generatedAt : undefined);
  const analyzedAt = snapshot?.payload.socialTickerAnalyzedAt ?? (tickerPosts.some((post) => post.analyzed !== false) ? snapshot?.payload.socialAnalyzedAt ?? snapshot?.payload.socialUpdatedAt : undefined);

  return <main className="dashboard-page">
    <SiteHeader />
    <div className="page-shell dashboard-content">
      <SocialSubnav />
      <section className="dashboard-hero compact-hero">
        <div><p className="kicker">TICKER MONITORING</p><h1>X 티커 모니터링</h1><p className="hero-copy">등록한 티커의 캐시태그와 기업명을 X 전체 공개 게시물에서 검색합니다. 계정 모니터링 데이터와 한 저장소에서 중복을 제거합니다.</p></div>
        <div className="refresh-panel social-update-times"><span>LAST TICKER SEARCH</span><strong>{collectedAt ? formatDateTime(collectedAt) : "아직 없음"}</strong><span>LAST LLM ANALYSIS</span><strong>{analyzedAt ? formatDateTime(analyzedAt) : "아직 없음"}</strong></div>
      </section>

      {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "X 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p></aside> : null}
      {!settings.migrationReady ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>티커 모니터링 테이블이 필요합니다</strong></div><p>Supabase SQL Editor에서 <code>202608190013_x_ticker_monitoring.sql</code>을 실행하세요. 기존 계정 데이터는 변경되지 않습니다.</p></aside> : null}

      <XTickerSettings initialTickers={settings.tickers} migrationReady={settings.migrationReady} />
      <XCollectionPanel initialLookbackDays={settings.lookbackDays} initialPerAccountPostLimit={settings.perTickerPostLimit} initialTotalPostLimit={settings.totalPostLimit} accountCount={settings.activeTickers.length} scope="tickers" targetLabel="티커" storedPostCount={tickerPosts.length} initialRun={latestRun} />

      {tickerPosts.length ? <SocialResults social={snapshot!.payload.social} mode="tickers" /> : <section className="empty-state social-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO TICKER DATA YET</p><h2>아직 저장된 티커 검색 데이터가 없습니다.</h2><p>티커를 추가·활성화한 뒤 검색 기간과 게시물 상한을 확인하고 수집을 실행하세요.</p></section>}
    </div>
    <SiteFooter />
  </main>;
}
