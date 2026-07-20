import Link from "next/link";
import { MacroCard } from "@/components/macro-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SocialResults } from "@/components/social-results";
import { formatDateTime } from "@/lib/format";
import { getSnapshotById, getSnapshotSource } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let snapshot = null;
  let databaseError = "";
  try {
    snapshot = await getSnapshotById(id);
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "히스토리를 불러오지 못했습니다.";
  }
  const source = snapshot ? getSnapshotSource(snapshot) : null;

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <Link className="history-back" href="/history">← 히스토리 목록</Link>
        {databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>데이터베이스 확인이 필요합니다</strong></div><p>{databaseError}</p></aside> : null}
        {!snapshot ? <section className="empty-state social-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NOT FOUND</p><h2>해당 갱신 기록이 없습니다.</h2><p>보관 개수 제한으로 정리됐거나 존재하지 않는 주소입니다.</p></section> : (
          <>
            <section className="history-detail-head"><div><p className="kicker">SAVED SNAPSHOT</p><h1>{source === "macro" ? "FRED 매크로 갱신" : source === "social" ? "X 수집·분석" : "이전 갱신 결과"}</h1><p>{formatDateTime(snapshot.createdAt)}에 저장된 결과입니다. 조회만으로 API 요금은 발생하지 않습니다.</p></div><span className={`history-source large ${source ?? "unknown"}`}>{source === "macro" ? "FRED" : source === "social" ? "X" : "이전"}</span></section>
            {(source === "macro" || source === null) && snapshot.payload.macro.length ? <section className="section-block macro-section"><div className="section-title"><div><p className="kicker">FRED SERIES</p><h2>매크로 온도판</h2></div><p>{snapshot.payload.macro.length}개 지표</p></div><div className="macro-grid">{snapshot.payload.macro.map((series) => <MacroCard series={series} key={series.id} />)}</div></section> : null}
            {(source === "social" || source === null) && (snapshot.payload.social.posts.length || snapshot.payload.social.companies.length) ? <SocialResults social={snapshot.payload.social} expanded /> : null}
          </>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
