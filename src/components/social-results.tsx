import type { MentionSummary, SocialPost } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

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
          <i className="positive" style={{ width: `${positiveWidth}%` }} /><i className="neutral" style={{ width: `${neutralWidth}%` }} /><i className="negative" style={{ width: `${negativeWidth}%` }} />
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

export function SocialResults({ social }: { social: { analysisModel?: string; periodDays: number; accounts: unknown[]; posts: SocialPost[]; companies: MentionSummary[]; analyzedPostCount: number } }) {
  return (
    <>
      <section className="section-block signal-section">
        <div className="section-title"><div><p className="kicker">01 · MENTION SUMMARY</p><h2>기업 언급과 감성</h2></div><p>최근 {social.periodDays}일 · {social.accounts.length}개 계정 · {social.analyzedPostCount}개 게시물</p></div>
        <div className="signal-grid">
          <div className="company-board">
            <div className="board-head"><span>RANK / COMPANY</span><span>SENTIMENT</span><span>MENTIONS</span></div>
            {social.companies.slice(0, 12).map((company, index) => <CompanyRow company={company} rank={index + 1} key={company.ticker} />)}
            {!social.companies.length ? <p className="board-empty">수집된 게시물에서 기업 언급을 찾지 못했습니다.</p> : null}
          </div>
          <aside className="signal-note">
            <span className="note-index">NOTE 01</span><h3>카운트 해석법</h3>
            <p>한 게시물에 여러 기업이 나오면 기업마다 1회씩 집계합니다. 같은 게시물은 ID로 중복 제거됩니다.</p>
            <div className="legend"><span><i className="positive" />긍정</span><span><i className="neutral" />중립</span><span><i className="negative" />부정</span></div>
            <small>{social.analysisModel ? `OpenAI ${social.analysisModel} 문맥 분석입니다.` : "기존 규칙 기반으로 분석된 스냅샷입니다."} 결과는 투자 조언이 아닙니다.</small>
          </aside>
        </div>
      </section>
      <section className="section-block">
        <div className="section-title"><div><p className="kicker">02 · COLLECTED POSTS</p><h2>최근 수집 게시물</h2></div><p>최신순 · reply와 repost 제외</p></div>
        <div className="post-grid">{social.posts.slice(0, 12).map((post) => <PostCard post={post} key={post.id} />)}</div>
        {!social.posts.length ? <div className="inline-empty">아직 수집된 X 게시물이 없습니다.</div> : null}
      </section>
    </>
  );
}
