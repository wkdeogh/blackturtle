import { MacroCard } from "@/components/macro-card";
import { RefreshButton } from "@/components/dashboard-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatDateTime } from "@/lib/format";
import { getLatestSnapshot, getMissingConfiguration, getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MacroPage() {
  let snapshot = null;
  let databaseError = "";
  try {
    snapshot = await getLatestSnapshot();
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
          <div><p className="kicker">FRED · MACRO PULSE</p><h1>매크로를<br /><em>맥락과 함께.</em></h1><p className="hero-copy">저장된 마지막 FRED 데이터입니다. 이 페이지를 여는 것만으로는 FRED나 X API를 호출하지 않습니다.</p></div>
          <div className="refresh-panel"><span>LAST FRED UPDATE</span><strong>{updatedAt ? formatDateTime(updatedAt) : "아직 없음"}</strong><RefreshButton source="macro" compact /></div>
        </section>

        {missing.length || databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "FRED 설정이 남아 있습니다"}</strong></div><p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p><p className="setup-help">저장소의 <code>SETUP.html</code>과 <code>.env.example</code>을 확인하세요.</p></aside> : null}

        {!snapshot?.payload.macro.length ? (
          <section className="empty-state"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO FRED DATA YET</p><h2>아직 저장된 매크로 데이터가 없습니다.</h2><p>{getSupabaseAdmin() ? "첫 FRED 갱신을 실행하면 이 자리에 저장합니다. X API는 호출하지 않습니다." : "Supabase 연결과 환경 변수를 완료한 뒤 첫 갱신을 실행하세요."}</p><RefreshButton source="macro" /></section>
        ) : (
          <section className="section-block macro-section">
            <div className="section-title"><div><p className="kicker">01 · MACRO TEMPERATURE</p><h2>매크로 온도판</h2></div><p>각 막대 아래 날짜는 해당 FRED 관측일입니다.</p></div>
            <div className="macro-grid">{snapshot.payload.macro.map((series) => <MacroCard series={series} key={series.id} />)}</div>
          </section>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
