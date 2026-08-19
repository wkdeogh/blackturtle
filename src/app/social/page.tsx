import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SocialSubnav } from "@/components/social-subnav";
import { SocialResults } from "@/components/social-results";
import { XCollectionPanel } from "@/components/x-collection-panel";
import { formatDateTime } from "@/lib/format";
import { getLatestRefreshRun, getLatestSnapshot, getMissingConfiguration, getXMonitorSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  let snapshot = null;
  let latestRun = null;
  let databaseError = "";
  let settings: Awaited<ReturnType<typeof getXMonitorSettings>> = { accounts: [], usernames: [], lookbackDays: 7, perAccountPostLimit: null, totalPostLimit: null, source: "none", accountStatusReady: false };
  const [snapshotResult, settingsResult, runResult] = await Promise.allSettled([getLatestSnapshot(), getXMonitorSettings(), getLatestRefreshRun()]);
  if (snapshotResult.status === "fulfilled") snapshot = snapshotResult.value;
  else databaseError = snapshotResult.reason instanceof Error ? snapshotResult.reason.message : "데이터베이스에 연결하지 못했습니다.";
  if (settingsResult.status === "fulfilled") settings = settingsResult.value;
  else if (!databaseError) databaseError = settingsResult.reason instanceof Error ? settingsResult.reason.message : "X 설정을 불러오지 못했습니다.";
  if (runResult.status === "fulfilled") latestRun = runResult.value;
  else if (!databaseError) databaseError = runResult.reason instanceof Error ? runResult.reason.message : "갱신 상태를 확인하지 못했습니다.";
  const missing = getMissingConfiguration("social");
  const accountPosts = snapshot?.payload.social.posts.filter((post) => post.source !== "ticker") ?? [];
  const collectedAt = snapshot?.payload.socialAccountCollectedAt ?? (accountPosts.length ? snapshot?.payload.socialCollectedAt ?? snapshot?.payload.socialUpdatedAt ?? snapshot?.payload.generatedAt : undefined);
  const analyzedAt = snapshot?.payload.socialAccountAnalyzedAt ?? (accountPosts.some((post) => post.analyzed !== false) ? snapshot?.payload.socialAnalyzedAt ?? snapshot?.payload.socialUpdatedAt : undefined);

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <SocialSubnav />
        <section className="dashboard-hero compact-hero">
          <div><p className="kicker">ACCOUNT MONITORING</p><h1>X 계정 모니터링</h1><p className="hero-copy">등록한 계정의 게시물을 수집하고 기업 언급·감성·주요 주제를 분석합니다. 티커 검색은 별도 탭에서 관리합니다.</p></div>
          <div className="refresh-panel social-update-times"><span>LAST X COLLECTION</span><strong>{collectedAt ? formatDateTime(collectedAt) : "아직 없음"}</strong><span>LAST LLM ANALYSIS</span><strong>{analyzedAt ? formatDateTime(analyzedAt) : "아직 없음"}</strong></div>
        </section>

        {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "X 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p><p className="setup-help">저장소의 <code>SETUP.html</code>과 <code>.env.example</code>을 확인하세요.</p></aside> : null}

        <XCollectionPanel initialLookbackDays={settings.lookbackDays} initialPerAccountPostLimit={settings.perAccountPostLimit} initialTotalPostLimit={settings.totalPostLimit} accountCount={settings.usernames.length} storedPostCount={accountPosts.length} initialRun={latestRun} />
        {!settings.usernames.length ? <aside className="account-required"><strong>활성화된 모니터링 계정이 없습니다.</strong><Link href="/settings">계정 설정으로 이동 →</Link></aside> : null}

        {accountPosts.length ? <SocialResults social={snapshot!.payload.social} mode="accounts" /> : <section className="empty-state social-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO ACCOUNT DATA YET</p><h2>아직 저장된 계정 수집 데이터가 없습니다.</h2><p>계정을 등록하고 수집 범위와 상한을 확인한 뒤 위의 수집 버튼을 누르세요.</p></section>}
      </div>
      <SiteFooter />
    </main>
  );
}
