import { ComprehensiveAnalysisPanel } from "@/components/comprehensive-analysis-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveOpenAIComprehensiveModel } from "@/lib/openai-config";
import { getComprehensiveAnalysisState, getLatestSnapshot } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  let snapshot = null;
  let state: Awaited<ReturnType<typeof getComprehensiveAnalysisState>> = { migrationReady: false, latestRun: null, latestReport: null };
  let databaseError = "";
  try { [snapshot, state] = await Promise.all([getLatestSnapshot(), getComprehensiveAnalysisState()]); }
  catch (error) { databaseError = error instanceof Error ? error.message : "종합분석 데이터를 불러오지 못했습니다."; }
  const hasData = Boolean(snapshot && (snapshot.payload.macro.length || snapshot.payload.market?.series.length || snapshot.payload.social.posts.length));
  const analysisModel = resolveOpenAIComprehensiveModel(process.env.OPENAI_COMPREHENSIVE_MODEL);

  return <main className="dashboard-page">
    <SiteHeader />
    <div className="page-shell dashboard-content">
      <section className="page-intro analysis-intro"><p className="kicker">COMPREHENSIVE ANALYSIS</p><h1>종합분석</h1><p>현재 저장된 매크로·시장지수·X 모니터링 데이터를 함께 읽어 투자자 관점의 조건부 인사이트와 확인 항목을 정리합니다.</p></section>
      {databaseError ? <aside className="setup-alert"><div><span className="alert-dot" /><strong>데이터베이스 확인이 필요합니다</strong></div><p>{databaseError}</p></aside> : null}
      {!hasData && !databaseError ? <aside className="setup-alert"><div><span className="alert-dot" /><strong>분석할 데이터가 없습니다</strong></div><p>매크로, 시장지수 또는 X 모니터링 데이터를 먼저 한 번 이상 갱신하세요.</p></aside> : null}
      <ComprehensiveAnalysisPanel initialRun={state.latestRun} initialReport={state.latestReport} currentSnapshotId={snapshot?.id ?? null} migrationReady={state.migrationReady} hasData={hasData} analysisModel={analysisModel} />
    </div>
    <SiteFooter />
  </main>;
}
