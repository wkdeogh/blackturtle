import Link from "next/link";
import { HistoryRetentionSettings } from "@/components/history-retention-settings";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatDateTime } from "@/lib/format";
import { getHistorySettings, getSnapshotHistory, getSnapshotSource } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  let history: Awaited<ReturnType<typeof getSnapshotHistory>> = [];
  let settings: Awaited<ReturnType<typeof getHistorySettings>> = { retentionLimit: 30, migrationReady: false };
  let databaseError = "";
  try {
    settings = await getHistorySettings();
    history = await getSnapshotHistory(settings.retentionLimit);
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "히스토리를 불러오지 못했습니다.";
  }

  return (
    <main className="dashboard-page">
      <SiteHeader />
      <div className="page-shell dashboard-content">
        <section className="page-intro history-intro"><p className="kicker">HISTORY</p><h1>갱신 히스토리</h1><p>성공한 매크로·시장지수·X 갱신 결과를 실행별로 보관합니다. 이 페이지를 열어도 외부 API는 호출되지 않습니다.</p></section>

        {databaseError ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>데이터베이스 확인이 필요합니다</strong></div><p>{databaseError}</p></aside> : null}
        {!settings.migrationReady ? <aside className="setup-alert" role="status"><div><span className="alert-dot" /><strong>보관 제한 설정이 필요합니다</strong></div><p>Supabase SQL Editor에서 <code>202607200006_snapshot_history.sql</code>을 실행하세요. 기존 스냅샷은 그대로 유지됩니다.</p></aside> : null}

        <HistoryRetentionSettings initialLimit={settings.retentionLimit} migrationReady={settings.migrationReady} />

        <section className="history-section">
          <div className="section-title"><div><p className="kicker">SAVED RUNS</p><h2>저장된 결과</h2></div><p>{history.length} / 최대 {settings.retentionLimit}회</p></div>
          {history.length ? <div className="history-list">{history.map((snapshot) => {
            const source = getSnapshotSource(snapshot);
            const isSocial = source === "social";
            const isMarket = source === "market";
            return (
              <Link className="history-row" href={`/history/${snapshot.id}`} key={snapshot.id}>
                <div className={`history-source ${source ?? "unknown"}`}>{source === "macro" ? "매크로" : isMarket ? "시장" : isSocial ? "X" : "이전"}</div>
                <div className="history-main"><strong>{source === "macro" ? "매크로 갱신" : isMarket ? "시장지수 갱신" : isSocial ? "X 수집·분석" : "이전 갱신 결과"}</strong><time dateTime={snapshot.createdAt}>{formatDateTime(snapshot.createdAt)}</time></div>
                <div className="history-stats">{source === "macro" ? <><b>{snapshot.payload.macro.length}</b><span>지표</span></> : isMarket ? <><b>{(snapshot.payload.market?.series.length ?? 0) + (snapshot.payload.market?.countryEtfs.length ?? 0)}</b><span>시장 시계열</span></> : <><b>{snapshot.payload.social.posts.length}</b><span>게시물 · {snapshot.payload.social.companies.length}개 기업</span></>}</div>
                <span className="history-arrow" aria-hidden="true">→</span>
              </Link>
            );
          })}</div> : <div className="inline-empty history-empty">아직 저장된 갱신 결과가 없습니다.</div>}
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
