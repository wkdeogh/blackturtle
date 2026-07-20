import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
  const updatedAt = snapshot?.payload.socialUpdatedAt ?? (snapshot?.payload.social.posts.length ? snapshot.payload.generatedAt : undefined);

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <section className="dashboard-hero compact-hero">
          <div><p className="kicker">X DATA</p><h1>X 모니터링 결과</h1><p className="hero-copy">저장된 마지막 X 분석 결과입니다. 아래 버튼을 눌러야만 X API를 호출하며 FRED는 갱신하지 않습니다.</p></div>
          <div className="refresh-panel"><span>LAST X UPDATE</span><strong>{updatedAt ? formatDateTime(updatedAt) : "아직 없음"}</strong><Link className="secondary-link" href="/settings">모니터링 계정 관리 →</Link></div>
        </section>

        {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "X 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p><p className="setup-help">저장소의 <code>SETUP.html</code>과 <code>.env.example</code>을 확인하세요.</p></aside> : null}

        <XCollectionPanel initialLookbackDays={settings.lookbackDays} initialPerAccountPostLimit={settings.perAccountPostLimit} initialTotalPostLimit={settings.totalPostLimit} accountCount={settings.usernames.length} initialRun={latestRun} />
        {!settings.usernames.length ? <aside className="account-required"><strong>활성화된 모니터링 계정이 없습니다.</strong><Link href="/settings">계정 설정으로 이동 →</Link></aside> : null}

        {snapshot?.payload.social.posts.length || snapshot?.payload.social.companies.length ? <SocialResults social={snapshot.payload.social} /> : <section className="empty-state social-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO X DATA YET</p><h2>아직 저장된 X 수집 데이터가 없습니다.</h2><p>계정을 등록하고 수집 범위와 상한을 확인한 뒤 위의 수집 버튼을 누르세요.</p></section>}
      </div>
      <SiteFooter />
    </main>
  );
}
