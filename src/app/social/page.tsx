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
  try {
    [snapshot, settings, latestRun] = await Promise.all([getLatestSnapshot(), getXMonitorSettings(), getLatestRefreshRun()]);
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "데이터베이스에 연결하지 못했습니다.";
  }
  const missing = getMissingConfiguration("social");
  const collectedAt = snapshot?.payload.socialCollectedAt ?? snapshot?.payload.socialUpdatedAt ?? (snapshot?.payload.social.posts.length ? snapshot.payload.generatedAt : undefined);
  const analyzedAt = snapshot?.payload.socialAnalyzedAt ?? (snapshot?.payload.social.analysisModel ? snapshot.payload.socialUpdatedAt ?? snapshot.payload.generatedAt : undefined);

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <SocialSubnav />
        <section className="dashboard-hero compact-hero">
          <div><p className="kicker">X DATA</p><h1>X 모니터링 결과</h1><p className="hero-copy">X 원문 수집과 저장된 원문의 LLM 분석을 각각 실행합니다. LLM 재분석은 X API를 호출하지 않습니다.</p></div>
          <div className="refresh-panel social-update-times"><span>LAST X COLLECTION</span><strong>{collectedAt ? formatDateTime(collectedAt) : "아직 없음"}</strong><span>LAST LLM ANALYSIS</span><strong>{analyzedAt ? formatDateTime(analyzedAt) : "아직 없음"}</strong></div>
        </section>

        {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "X 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p><p className="setup-help">저장소의 <code>SETUP.html</code>과 <code>.env.example</code>을 확인하세요.</p></aside> : null}

        <XCollectionPanel initialLookbackDays={settings.lookbackDays} initialPerAccountPostLimit={settings.perAccountPostLimit} initialTotalPostLimit={settings.totalPostLimit} accountCount={settings.usernames.length} storedPostCount={snapshot?.payload.social.posts.length ?? 0} initialRun={latestRun} />
        {!settings.usernames.length ? <aside className="account-required"><strong>활성화된 모니터링 계정이 없습니다.</strong><Link href="/settings">계정 설정으로 이동 →</Link></aside> : null}

        {snapshot?.payload.social.posts.length || snapshot?.payload.social.companies.length ? <SocialResults social={snapshot.payload.social} /> : <section className="empty-state social-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO X DATA YET</p><h2>아직 저장된 X 수집 데이터가 없습니다.</h2><p>계정을 등록하고 수집 범위와 상한을 확인한 뒤 위의 수집 버튼을 누르세요.</p></section>}
      </div>
      <SiteFooter />
    </main>
  );
}
