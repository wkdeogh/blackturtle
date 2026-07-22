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
  posts: SocialPost[];
  companies: MentionSummary[];
  analyzedPostCount: number;
}

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
  return (
    <article className="post-card">
      <div className="post-head"><strong>@{post.username}</strong><time dateTime={post.postedAt}>{formatDateTime(post.postedAt)}</time></div>
      <p>{post.text}</p>
      <div className="post-foot">
        <div className="mention-chips">
          {post.mentions.map((mention) => <span className={`mention-chip ${mention.sentiment}`} key={mention.ticker}>${mention.ticker} · {mention.sentiment === "positive" ? "긍정" : mention.sentiment === "negative" ? "부정" : "중립"}</span>)}
          {post.analyzed === false ? <span className="mention-chip pending">분석 대기</span> : !post.mentions.length ? <span className="mention-chip none">기업 미분류</span> : null}
        </div>
        <a href={post.url} target="_blank" rel="noreferrer">원문 ↗</a>
      </div>
    </article>
  );
}

export function SocialResults({ social, expanded = false }: { social: SocialResultsData; expanded?: boolean }) {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const accountNames = useMemo(() => {
    const names = new Set(social.accounts.map((account) => account.username.toLowerCase()));
    for (const post of social.posts) names.add(post.username.toLowerCase());
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [social.accounts, social.posts]);
  const filteredPosts = useMemo(
    () => selectedAccount === "all" ? social.posts : social.posts.filter((post) => post.username.toLowerCase() === selectedAccount),
    [selectedAccount, social.posts],
  );
  const filteredCompanies = useMemo(
    () => selectedAccount === "all" ? social.companies : aggregateCompanies(filteredPosts),
    [filteredPosts, selectedAccount, social.companies],
  );
  const filteredAnalyzedCount = filteredPosts.filter((post) => post.analyzed !== false).length;
  const companies = expanded ? filteredCompanies : filteredCompanies.slice(0, 12);
  const posts = expanded ? filteredPosts : filteredPosts.slice(0, 12);
  const accountLabel = selectedAccount === "all" ? "전체 계정" : `@${selectedAccount}`;
  const topics = social.topics ?? [];
  const postsById = useMemo(() => new Map(social.posts.map((post) => [post.id, post])), [social.posts]);
  const maxTopicCount = topics[0]?.postCount ?? 1;
  return (
    <>
      <section className="section-block topic-section">
        <div className="section-title"><div><p className="kicker">01 · RECURRING THEMES</p><h2>주요 주제</h2></div><p>전체 계정 · 빈도순 · {social.topicModel ? `OpenAI ${social.topicModel}` : "LLM 분석 후 생성"}</p></div>
        {social.topicSummaryStale ? <div className="topic-stale-notice">최근 X 수집분은 아직 반영되지 않았습니다. 저장 데이터 LLM 재분석을 실행하면 갱신됩니다.</div> : null}
        {topics.length ? <div className="topic-grid">{topics.map((topic, index) => <TopicCard topic={topic} rank={index + 1} maxCount={maxTopicCount} postsById={postsById} key={`${topic.title}-${index}`} />)}</div> : <div className={social.topicSummaryError ? "inline-empty topic-empty error" : "inline-empty topic-empty"}>{social.topicSummaryError ? `주제 요약 실패: ${social.topicSummaryError}` : social.topicSummaryStale ? "저장 데이터 LLM 재분석을 실행하면 주요 주제를 생성합니다." : social.topics ? "반복해서 등장한 주제를 찾지 못했습니다." : "아직 주요 주제 분석 결과가 없습니다."}</div>}
        <p className="topic-footnote">게시물 하나가 여러 주제와 관련되면 각 주제에 함께 집계될 수 있습니다. 전체 수집 게시물의 공통 흐름을 요약하며 투자 조언이 아닙니다.</p>
      </section>
      <section className="result-filter" aria-label="X 결과 계정 필터">
        <div><span>ACCOUNT VIEW</span><strong>{accountLabel}</strong><small>기업 언급과 게시물을 같은 계정 기준으로 필터링합니다.</small></div>
        <label htmlFor="social-account-filter">계정 선택<select id="social-account-filter" value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}><option value="all">전체</option>{accountNames.map((username) => <option value={username} key={username}>@{username}</option>)}</select></label>
      </section>
      <section className="section-block signal-section">
        <div className="section-title"><div><p className="kicker">02 · MENTION SUMMARY</p><h2>기업 언급</h2></div><p>{accountLabel} · 최근 {social.periodDays}일 · 분석 {filteredAnalyzedCount}/{filteredPosts.length}개</p></div>
        <div className="signal-grid">
          <div className="company-board">
            <div className="board-head"><span>RANK / COMPANY</span><span>SENTIMENT</span><span>MENTIONS</span></div>
            {companies.map((company, index) => <CompanyRow company={company} rank={index + 1} key={company.ticker} />)}
            {!filteredCompanies.length ? <p className="board-empty">선택한 계정의 게시물에서 기업 언급을 찾지 못했습니다.</p> : null}
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
        <div className="section-title"><div><p className="kicker">03 · COLLECTED POSTS</p><h2>최근 수집 게시물</h2></div><p>{accountLabel} · 최신순 · reply와 repost 제외</p></div>
        <div className="post-grid">{posts.map((post) => <PostCard post={post} key={post.id} />)}</div>
        {!filteredPosts.length ? <div className="inline-empty">선택한 계정에서 수집된 X 게시물이 없습니다.</div> : null}
      </section>
    </>
  );
}
