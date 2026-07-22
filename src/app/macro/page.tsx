import { MacroResults } from "@/components/macro-results";
import { RefreshButton } from "@/components/dashboard-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatDateTime } from "@/lib/format";
import { getLatestRefreshRun, getLatestSnapshot, getMissingConfiguration, getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MacroPage() {
  let snapshot = null;
  let latestRun = null;
  let databaseError = "";
  try {
    [snapshot, latestRun] = await Promise.all([getLatestSnapshot(), getLatestRefreshRun()]);
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "데이터베이스에 연결하지 못했습니다.";
  }
  const missing = getMissingConfiguration("macro");
  const updatedAt = snapshot?.payload.macroUpdatedAt ?? (snapshot?.payload.macro.length ? snapshot.payload.generatedAt : undefined);

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <section className="dashboard-hero compact-hero">
          <div><p className="kicker">MACRO DATA</p><h1>매크로</h1><p className="hero-copy">저장된 마지막 시장 심리·경제 지표입니다. 이 페이지를 여는 것만으로는 외부 데이터를 호출하지 않습니다.</p></div>
          <div className="refresh-panel"><span>LAST MACRO UPDATE</span><strong>{updatedAt ? formatDateTime(updatedAt) : "아직 없음"}</strong><RefreshButton source="macro" initialRun={latestRun} compact /></div>
        </section>

        {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "매크로 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p><p className="setup-help">저장소의 <code>SETUP.html</code>과 <code>.env.example</code>을 확인하세요.</p></aside> : null}

        {!snapshot?.payload.macro.length ? (
          <section className="empty-state"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO MACRO DATA YET</p><h2>아직 저장된 매크로 데이터가 없습니다.</h2><p>{getSupabaseAdmin() ? "첫 매크로 갱신을 실행하면 이 자리에 저장합니다. X API는 호출하지 않습니다." : "Supabase 연결과 환경 변수를 완료한 뒤 첫 갱신을 실행하세요."}</p><RefreshButton source="macro" initialRun={latestRun} /></section>
        ) : (
          <MacroResults series={snapshot.payload.macro} />
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
