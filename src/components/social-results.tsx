"use client";

import { useMemo, useState } from "react";
import type { MentionSummary, SocialPost, TopicSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

interface SocialResultsData {
  analysisModel?: string;
  topicModel?: string;
  topicSummaryError?: string;
  topicSummaryStale?: boolean;
  topics?: TopicSummary[];
  periodDays: number;
  accounts: Array<{ username: string }>;
  tickerPeriodDays?: number;
  tickers?: Array<{ ticker: string }>;
  posts: SocialPost[];
  companies: MentionSummary[];
  analyzedPostCount: number;
}

const POSTS_PER_PAGE = 20;

function TopicCard({ topic, rank, maxCount, postsById }: { topic: TopicSummary; rank: number; maxCount: number; postsById: Map<string, SocialPost> }) {
  const accounts = [...new Set(topic.postIds.map((id) => postsById.get(id)?.username).filter((value): value is string => Boolean(value)))];
  return (
    <article className="topic-card">
      <div className="topic-card-head"><span>{String(rank).padStart(2, "0")}</span><strong>{topic.postCount}개 게시물</strong></div>
      <h3>{topic.title}</h3>
      <p>{topic.summary}</p>
      <div className="topic-frequency" aria-label={`관련 게시물 ${topic.postCount}개`}><i style={{ width: `${Math.max(8, (topic.postCount / Math.max(1, maxCount)) * 100)}%` }} /></div>
      <div className="topic-meta"><div>{topic.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div><small>{accounts.length ? accounts.map((account) => `@${account}`).join(" · ") : "전체 계정"}</small></div>
    </article>
  );
}

function aggregateCompanies(posts: SocialPost[]): MentionSummary[] {
  const summary = new Map<string, MentionSummary>();
  for (const post of posts) {
    for (const mention of post.mentions) {
      const current = summary.get(mention.ticker) ?? {
        ticker: mention.ticker,
        name: mention.name,
        total: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        lastMentionAt: post.postedAt,
      };
      current.total += 1;
      current[mention.sentiment] += 1;
      if (post.postedAt > current.lastMentionAt) current.lastMentionAt = post.postedAt;
      summary.set(mention.ticker, current);
    }
  }
  return [...summary.values()].sort((left, right) => right.total - left.total || right.positive - left.positive);
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
          <i className="positive" style={{ width: `${positiveWidth}%` }} /><i className="neutral" style={{ width: `${neutralWidth}%` }} /><i className="negative" style={{ width: `${negativeWidth}%` }} />
        </div>
        <div className="sentiment-counts"><span>+ {company.positive}</span><span>중립 {company.neutral}</span><span>− {company.negative}</span></div>
      </div>
      <strong className="total-count">{company.total}</strong>
    </div>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const translation = post.translationKo?.trim();
  const showTranslation = Boolean(translation) && (post.lang?.toLowerCase() !== "ko" || translation !== post.text.trim());
  return (
    <article className="post-card">
      <div className="post-head"><div><strong>@{post.username}</strong><span className={`post-source-badge ${post.source === "ticker" || post.matchedTickers?.length ? "ticker" : "account"}`}>{post.source === "ticker" || post.matchedTickers?.length ? "티커 검색" : "계정 수집"}</span></div><time dateTime={post.postedAt}>{formatDateTime(post.postedAt)}</time></div>
      <p>{post.text}</p>
      {showTranslation ? <div className="post-translation"><span>한국어 번역</span><p>{translation}</p></div> : !translation && post.lang?.toLowerCase() !== "ko" ? <div className="post-translation pending"><span>한국어 번역</span><p>{post.analyzed === false ? "LLM 분석 대기 중입니다." : "저장 데이터 LLM 재분석 후 번역이 표시됩니다."}</p></div> : null}
      <div className="post-foot">
        <div className="mention-chips">
          {post.matchedTickers?.map((ticker) => <span className="mention-chip matched" key={`matched-${ticker}`}>${ticker} 검색</span>)}
          {post.mentions.map((mention) => <span className={`mention-chip ${mention.sentiment}`} key={mention.ticker}>${mention.ticker} · {mention.sentiment === "positive" ? "긍정" : mention.sentiment === "negative" ? "부정" : "중립"}</span>)}
          {post.analyzed === false ? <span className="mention-chip pending">분석 대기</span> : !post.mentions.length ? <span className="mention-chip none">기업 미분류</span> : null}
        </div>
        <a href={post.url} target="_blank" rel="noreferrer">원문 ↗</a>
      </div>
    </article>
  );
}

export function SocialResults({ social, expanded = false, mode = "accounts" }: { social: SocialResultsData; expanded?: boolean; mode?: "accounts" | "tickers" }) {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedPostAccount, setSelectedPostAccount] = useState<string | null>(null);
  const [visiblePostLimit, setVisiblePostLimit] = useState(POSTS_PER_PAGE);
  const scopedPosts = useMemo(
    () => social.posts.filter((post) => mode === "tickers" ? post.source === "ticker" || Boolean(post.matchedTickers?.length) : post.source !== "ticker"),
    [mode, social.posts],
  );
  const accountNames = useMemo(() => {
    if (mode === "tickers") {
      const tickers = new Set((social.tickers ?? []).map((ticker) => ticker.ticker));
      for (const post of scopedPosts) for (const ticker of post.matchedTickers ?? []) tickers.add(ticker);
      return [...tickers].sort((left, right) => left.localeCompare(right));
    }
    const names = new Set(social.accounts.map((account) => account.username.toLowerCase()));
    for (const post of scopedPosts) names.add(post.username.toLowerCase());
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [mode, scopedPosts, social.accounts, social.tickers]);
  const filteredPosts = useMemo(
    () => selectedAccount === "all" ? scopedPosts : scopedPosts.filter((post) => mode === "tickers" ? post.matchedTickers?.includes(selectedAccount) : post.username.toLowerCase() === selectedAccount),
    [mode, scopedPosts, selectedAccount],
  );
  const filteredCompanies = useMemo(
    () => aggregateCompanies(filteredPosts),
    [filteredPosts],
  );
  const filteredAnalyzedCount = filteredPosts.filter((post) => post.analyzed !== false).length;
  const postAccountNames = useMemo(
    () => mode === "tickers" ? accountNames : [...new Set(scopedPosts.map((post) => post.username.toLowerCase()))].sort((left, right) => left.localeCompare(right)),
    [accountNames, mode, scopedPosts],
  );
  const activePostAccount = selectedPostAccount === "all" || (selectedPostAccount && postAccountNames.includes(selectedPostAccount))
    ? selectedPostAccount
    : postAccountNames[0] ?? "all";
  const visiblePosts = useMemo(
    () => activePostAccount === "all" ? scopedPosts : scopedPosts.filter((post) => mode === "tickers" ? post.matchedTickers?.includes(activePostAccount) : post.username.toLowerCase() === activePostAccount),
    [activePostAccount, mode, scopedPosts],
  );
  const displayedPosts = useMemo(
    () => visiblePosts.slice(0, visiblePostLimit),
    [visiblePostLimit, visiblePosts],
  );
  const postCountsByAccount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of postAccountNames) {
      counts.set(name, scopedPosts.filter((post) => mode === "tickers" ? post.matchedTickers?.includes(name) : post.username.toLowerCase() === name).length);
    }
    return counts;
  }, [mode, postAccountNames, scopedPosts]);
  const postGroups = useMemo(() => {
    const groups = new Map<string, SocialPost[]>();
    for (const post of displayedPosts) {
      const username = post.username.toLowerCase();
      const posts = groups.get(username) ?? [];
      posts.push(post);
      groups.set(username, posts);
    }
    return [...groups].map(([username, posts]) => ({ username, posts }));
  }, [displayedPosts]);
  const companies = expanded ? filteredCompanies : filteredCompanies.slice(0, 12);
  const accountLabel = selectedAccount === "all" ? (mode === "tickers" ? "전체 티커" : "전체 계정") : mode === "tickers" ? `$${selectedAccount}` : `@${selectedAccount}`;
  const scopedPostIds = useMemo(() => new Set(scopedPosts.map((post) => post.id)), [scopedPosts]);
  const topics = useMemo(() => (social.topics ?? []).map((topic) => ({ ...topic, postIds: topic.postIds.filter((id) => scopedPostIds.has(id)), postCount: topic.postIds.filter((id) => scopedPostIds.has(id)).length })).filter((topic) => topic.postCount > 0), [scopedPostIds, social.topics]);
  const postsById = useMemo(() => new Map(scopedPosts.map((post) => [post.id, post])), [scopedPosts]);
  const maxTopicCount = topics[0]?.postCount ?? 1;
  return (
    <>
      <section className="section-block topic-section">
        <div className="section-title"><div><p className="kicker">01 · RECURRING THEMES</p><h2>주요 주제</h2></div><p>{mode === "tickers" ? "티커 검색" : "계정 수집"} · 빈도순 · {social.topicModel ? `OpenAI ${social.topicModel}` : "LLM 분석 후 생성"}</p></div>
        {social.topicSummaryStale ? <div className="topic-stale-notice">최근 X 수집분은 아직 반영되지 않았습니다. 저장 데이터 LLM 재분석을 실행하면 갱신됩니다.</div> : null}
        {topics.length ? <div className="topic-grid stagger-grid">{topics.map((topic, index) => <TopicCard topic={topic} rank={index + 1} maxCount={maxTopicCount} postsById={postsById} key={`${topic.title}-${index}`} />)}</div> : <div className={social.topicSummaryError ? "inline-empty topic-empty error" : "inline-empty topic-empty"}>{social.topicSummaryError ? `주제 요약 실패: ${social.topicSummaryError}` : social.topicSummaryStale ? "저장 데이터 LLM 재분석을 실행하면 주요 주제를 생성합니다." : social.topics ? "반복해서 등장한 주제를 찾지 못했습니다." : "아직 주요 주제 분석 결과가 없습니다."}</div>}
        <p className="topic-footnote">게시물 하나가 여러 주제와 관련되면 각 주제에 함께 집계될 수 있습니다. 전체 수집 게시물의 공통 흐름을 요약하며 투자 조언이 아닙니다.</p>
      </section>
      <section className="result-filter" aria-label={`X 결과 ${mode === "tickers" ? "티커" : "계정"} 필터`}>
        <div><span>{mode === "tickers" ? "TICKER VIEW" : "ACCOUNT VIEW"}</span><strong>{accountLabel}</strong><small>기업 언급 집계를 선택한 {mode === "tickers" ? "검색 티커" : "계정"} 기준으로 필터링합니다.</small></div>
        <label htmlFor="social-account-filter">{mode === "tickers" ? "티커" : "계정"} 선택<select id="social-account-filter" value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}><option value="all">전체</option>{accountNames.map((name) => <option value={name} key={name}>{mode === "tickers" ? `$${name}` : `@${name}`}</option>)}</select></label>
      </section>
      <section className="section-block signal-section">
        <div className="section-title"><div><p className="kicker">02 · MENTION SUMMARY</p><h2>기업 언급</h2></div><p>{accountLabel} · 최근 {mode === "tickers" ? social.tickerPeriodDays ?? 1 : social.periodDays}일 · 분석 {filteredAnalyzedCount}/{filteredPosts.length}개</p></div>
        <div className="signal-grid filter-swap" key={selectedAccount}>
          <div className="company-board">
            <div className="board-head"><span>RANK / COMPANY</span><span>SENTIMENT</span><span>MENTIONS</span></div>
            {companies.map((company, index) => <CompanyRow company={company} rank={index + 1} key={company.ticker} />)}
            {!filteredCompanies.length ? <p className="board-empty">선택한 {mode === "tickers" ? "티커 검색" : "계정"} 게시물에서 기업 언급을 찾지 못했습니다.</p> : null}
          </div>
          <aside className="signal-note">
            <span className="note-index">NOTE 01</span><h3>카운트 해석법</h3>
            <p>한 게시물에 여러 기업이 나오면 기업마다 1회씩 집계합니다. 같은 게시물은 ID로 중복 제거됩니다.</p>
            <div className="legend"><span><i className="positive" />긍정</span><span><i className="neutral" />중립</span><span><i className="negative" />부정</span></div>
            <small>{social.analysisModel ? `OpenAI ${social.analysisModel} 문맥 분석입니다.` : "아직 LLM 분석 결과가 없습니다."} 분석 대기 게시물은 집계에서 제외하며 결과는 투자 조언이 아닙니다.</small>
          </aside>
        </div>
      </section>
      <section className="section-block">
        <div className="section-title"><div><p className="kicker">03 · COLLECTED POSTS</p><h2>최근 수집 게시물</h2></div><p>{activePostAccount === "all" ? (mode === "tickers" ? "전체 티커" : "전체 계정") : `${mode === "tickers" ? "$" : "@"}${activePostAccount}`} · {displayedPosts.length}/{visiblePosts.length}개 표시 · 최신순</p></div>
        {postAccountNames.length ? <div className="post-account-tabs" role="tablist" aria-label={`게시물을 볼 X ${mode === "tickers" ? "티커" : "계정"} 선택`}>
          {postAccountNames.map((name) => <button type="button" role="tab" aria-selected={activePostAccount === name} className={activePostAccount === name ? "active" : ""} onClick={() => { setSelectedPostAccount(name); setVisiblePostLimit(POSTS_PER_PAGE); }} key={name}><span>{mode === "tickers" ? "$" : "@"}{name}</span><small>{postCountsByAccount.get(name) ?? 0}</small></button>)}
          <button type="button" role="tab" aria-selected={activePostAccount === "all"} className={activePostAccount === "all" ? "active" : ""} onClick={() => { setSelectedPostAccount("all"); setVisiblePostLimit(POSTS_PER_PAGE); }}><span>전체</span><small>{scopedPosts.length}</small></button>
        </div> : null}
        <div className="account-post-groups filter-swap" key={activePostAccount}>{postGroups.map((group) => <section className="account-post-group" key={group.username}><div className="account-post-head"><h3>@{group.username}</h3><span>{group.posts.length}개 표시</span></div><div className="post-grid stagger-grid">{group.posts.map((post) => <PostCard post={post} key={post.id} />)}</div></section>)}</div>
        {displayedPosts.length < visiblePosts.length ? <div className="post-load-more"><button className="secondary-button" type="button" onClick={() => setVisiblePostLimit((current) => Math.min(current + POSTS_PER_PAGE, visiblePosts.length))}>게시물 {Math.min(POSTS_PER_PAGE, visiblePosts.length - displayedPosts.length)}개 더 보기</button><small>남은 {visiblePosts.length - displayedPosts.length}개</small></div> : null}
        {!visiblePosts.length ? <div className="inline-empty">선택한 {mode === "tickers" ? "티커" : "계정"}에서 수집된 X 게시물이 없습니다.</div> : null}
      </section>
    </>
  );
}
