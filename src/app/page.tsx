import { MacroCard } from "@/components/macro-card";
import { LogoutButton, RefreshButton } from "@/components/dashboard-actions";
import { getLatestSnapshot, getMissingConfiguration, getSupabaseAdmin } from "@/lib/supabase";
import type { MentionSummary, SocialPost } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function CompanyRow({ company, rank }: { company: MentionSummary; rank: number }) {
  const positiveWidth = company.total ? (company.positive / company.total) * 100 : 0;
  const neutralWidth = company.total ? (company.neutral / company.total) * 100 : 0;
  const negativeWidth = company.total ? (company.negative / company.total) * 100 : 0;
  return (
    <div className="company-row">
      <span className="rank">{String(rank).padStart(2, "0")}</span>
      <div className="company-identity"><strong>${company.ticker}</strong><span>{company.name}</span></div>
      <div className="sentiment-stack">
        <div className="sentiment-bar" aria-label={`긍정 ${company.positive}, 중립 ${company.neutral}, 부정 ${company.negative}`}>
          <i className="positive" style={{ width: `${positiveWidth}%` }} />
          <i className="neutral" style={{ width: `${neutralWidth}%` }} />
          <i className="negative" style={{ width: `${negativeWidth}%` }} />
        </div>
        <div className="sentiment-counts"><span>+ {company.positive}</span><span>중립 {company.neutral}</span><span>− {company.negative}</span></div>
      </div>
      <strong className="total-count">{company.total}</strong>
    </div>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  return (
    <article className="post-card">
      <div className="post-head"><strong>@{post.username}</strong><time dateTime={post.postedAt}>{formatDateTime(post.postedAt)}</time></div>
      <p>{post.text}</p>
      <div className="post-foot">
        <div className="mention-chips">
          {post.mentions.map((mention) => <span className={`mention-chip ${mention.sentiment}`} key={mention.ticker}>${mention.ticker} · {mention.sentiment === "positive" ? "긍정" : mention.sentiment === "negative" ? "부정" : "중립"}</span>)}
          {!post.mentions.length ? <span className="mention-chip none">기업 미분류</span> : null}
        </div>
        <a href={post.url} target="_blank" rel="noreferrer">원문 ↗</a>
      </div>
    </article>
  );
}

export default async function DashboardPage() {
  let snapshot = null;
  let databaseError = "";
  try {
    snapshot = await getLatestSnapshot();
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "데이터베이스에 연결하지 못했습니다.";
  }
  const missing = getMissingConfiguration();
  const databaseConfigured = Boolean(getSupabaseAdmin());

  return (
    <main className="dashboard-page">
      <header className="site-header">
        <div className="page-shell header-inner">
          <Link className="wordmark" href="/"><span className="turtle-mark" aria-hidden="true"><span /></span><span>BLACK TURTLE<small>INVESTMENT DESK</small></span></Link>
          <div className="header-actions"><span className="private-label">PRIVATE</span><LogoutButton /></div>
        </div>
      </header>

      <div className="page-shell dashboard-content">
        <section className="dashboard-hero">
          <div>
            <p className="kicker">MARKET SNAPSHOT</p>
            <h1>오늘의 시장을<br /><em>천천히, 선명하게.</em></h1>
            <p className="hero-copy">저장된 마지막 스냅샷입니다. 페이지를 여는 것만으로는 외부 API를 호출하지 않습니다.</p>
          </div>
          <div className="refresh-panel">
            <span>LAST SUCCESSFUL UPDATE</span>
            <strong>{snapshot ? formatDateTime(snapshot.payload.generatedAt) : "아직 없음"}</strong>
            <RefreshButton compact />
          </div>
        </section>

        {missing.length || databaseError ? (
          <aside className="setup-alert" role="status">
            <div><span className="alert-dot" /><strong>{databaseError ? "데이터베이스 확인이 필요합니다" : "외부 서비스 설정이 남아 있습니다"}</strong></div>
            <p>{databaseError || `미설정 환경 변수: ${missing.join(", ")}`}</p>
            <p className="setup-help">저장소의 <code>SETUP.html</code>과 <code>.env.example</code> 순서대로 설정하면 됩니다.</p>
          </aside>
        ) : null}

        {!snapshot ? (
          <section className="empty-state">
            <div className="empty-orbit"><span>0</span></div>
            <p className="kicker">NO SNAPSHOT YET</p>
            <h2>아직 저장된 데이터가 없습니다.</h2>
            <p>{databaseConfigured ? "첫 갱신을 실행하면 FRED와 X 데이터를 분석해 이 자리에 저장합니다." : "Supabase 연결과 환경 변수를 완료한 뒤 첫 갱신을 실행하세요."}</p>
            <RefreshButton />
          </section>
        ) : (
          <>
            <section className="section-block">
              <div className="section-title"><div><p className="kicker">01 · MACRO PULSE</p><h2>매크로 온도판</h2></div><p>FRED 최신 관측값 · 지표별 관측일 기준</p></div>
              <div className="macro-grid">{snapshot.payload.macro.map((series) => <MacroCard series={series} key={series.id} />)}</div>
            </section>

            <section className="section-block signal-section">
              <div className="section-title"><div><p className="kicker">02 · SOCIAL SIGNAL</p><h2>기업 언급과 감성</h2></div><p>최근 {snapshot.payload.social.periodDays}일 · {snapshot.payload.social.accounts.length}개 계정 · {snapshot.payload.social.analyzedPostCount}개 게시물</p></div>
              <div className="signal-grid">
                <div className="company-board">
                  <div className="board-head"><span>RANK / COMPANY</span><span>SENTIMENT</span><span>MENTIONS</span></div>
                  {snapshot.payload.social.companies.slice(0, 12).map((company, index) => <CompanyRow company={company} rank={index + 1} key={company.ticker} />)}
                  {!snapshot.payload.social.companies.length ? <p className="board-empty">수집된 게시물에서 기업 언급을 찾지 못했습니다.</p> : null}
                </div>
                <aside className="signal-note">
                  <span className="note-index">NOTE 01</span>
                  <h3>카운트 해석법</h3>
                  <p>한 게시물에 여러 기업이 나오면 기업마다 1회씩 집계합니다. 같은 게시물은 ID로 중복 제거됩니다.</p>
                  <div className="legend"><span><i className="positive" />긍정</span><span><i className="neutral" />중립</span><span><i className="negative" />부정</span></div>
                  <small>현재 MVP는 키워드·문맥 규칙 기반 분석입니다. 결과는 투자 조언이 아닙니다.</small>
                </aside>
              </div>
            </section>

            <section className="section-block">
              <div className="section-title"><div><p className="kicker">03 · SOURCE FEED</p><h2>최근 수집 게시물</h2></div><p>최신순 · reply와 repost 제외</p></div>
              <div className="post-grid">{snapshot.payload.social.posts.slice(0, 12).map((post) => <PostCard post={post} key={post.id} />)}</div>
            </section>
          </>
        )}
      </div>
      <footer className="site-footer"><div className="page-shell"><span>BLACK TURTLE · PRIVATE DASHBOARD</span><span>데이터 기준 시각을 항상 확인하세요.</span></div></footer>
    </main>
  );
}
