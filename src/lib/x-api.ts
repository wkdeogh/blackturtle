import { aggregateMentions, analyzePostsWithOpenAI, type PostAnalysisResult } from "@/lib/social-analysis";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { DashboardSnapshot, SocialPost, XAccountCursor, XTickerCursor } from "@/lib/types";
import type { XTickerMonitorSetting } from "@/lib/supabase";

export type RawSocialPost = Omit<SocialPost, "mentions" | "translationKo" | "analyzed">;

export interface PreparedXCollection {
  analysisModel: string;
  periodDays: number;
  accounts: XAccountCursor[];
  tickerPeriodDays?: number;
  tickers?: XTickerCursor[];
  rawPosts: RawSocialPost[];
  postsToAnalyze: RawSocialPost[];
  reusedAnalysis: PostAnalysisResult[];
}

interface XUserResponse {
  data?: { id: string; username: string };
  errors?: Array<{ detail?: string; title?: string }>;
}

interface XPostsResponse {
  data?: Array<{ id: string; text: string; author_id?: string; created_at?: string; lang?: string }>;
  includes?: { users?: Array<{ id: string; username: string }> };
  meta?: { newest_id?: string; next_token?: string };
  errors?: Array<{ detail?: string; title?: string }>;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function getUser(username: string, token: string): Promise<{ id: string; username: string }> {
  const response = await fetchWithTimeout(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, {
    headers: authHeaders(token),
    cache: "no-store",
  }, 30_000, `X @${username} 계정 조회`);
  const body = await readJsonResponse<XUserResponse>(response, `X @${username} 계정 조회`);
  if (!response.ok || !body.data) {
    throw new Error(`X @${username}: ${body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? response.statusText}`);
  }
  return body.data;
}

async function getPosts(
  user: { id: string; username: string },
  token: string,
  lookbackDays: number,
  postLimit: number | null,
  sinceId?: string,
): Promise<{ posts: RawSocialPost[]; newestPostId?: string }> {
  const posts: RawSocialPost[] = [];
  const seenTokens = new Set<string>();
  let paginationToken: string | undefined;
  let newestPostId: string | undefined = sinceId;

  do {
    const remaining = postLimit === null ? 100 : Math.max(0, postLimit - posts.length);
    if (postLimit !== null && remaining === 0) break;
    const params = new URLSearchParams({
      max_results: String(Math.min(100, Math.max(5, remaining))),
      exclude: "replies,retweets",
      "tweet.fields": "created_at,lang",
    });
    if (sinceId) {
      params.set("since_id", sinceId);
    } else {
      params.set("start_time", new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    }
    if (paginationToken) params.set("pagination_token", paginationToken);

    const response = await fetchWithTimeout(`https://api.x.com/2/users/${user.id}/tweets?${params}`, {
      headers: authHeaders(token),
      cache: "no-store",
    }, 45_000, `X @${user.username} 게시물 조회`);
    const body = await readJsonResponse<XPostsResponse>(response, `X @${user.username} 게시물 조회`);
    if (!response.ok) {
      throw new Error(`X @${user.username}: ${body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? response.statusText}`);
    }
    if (!paginationToken) newestPostId = body.meta?.newest_id ?? sinceId;
    posts.push(...(body.data ?? []).map((post) => ({
      id: post.id,
      username: user.username,
      text: post.text,
      postedAt: post.created_at ?? new Date().toISOString(),
      lang: post.lang,
      source: "account" as const,
      url: `https://x.com/${user.username}/status/${post.id}`,
    })));

    const nextToken = body.meta?.next_token;
    if (!nextToken || seenTokens.has(nextToken)) break;
    seenTokens.add(nextToken);
    paginationToken = nextToken;
  } while (postLimit === null || posts.length < postLimit);

  return {
    newestPostId,
    posts: postLimit === null ? posts : posts.slice(0, postLimit),
  };
}

export async function prepareXCollection(
  token: string,
  usernames: string[],
  lookbackDays: number,
  perAccountPostLimit: number | null,
  totalPostLimit: number | null,
  analysisModel: string,
  previous?: DashboardSnapshot["social"],
): Promise<PreparedXCollection> {
  const previousCursors = new Map(previous?.accounts.map((account) => [account.username.toLowerCase(), account]) ?? []);
  const results: Array<{ cursor: XAccountCursor; posts: RawSocialPost[] }> = [];
  let remainingTotal = totalPostLimit;

  for (const username of usernames) {
    const oldCursor = previousCursors.get(username.toLowerCase());
    if (remainingTotal !== null && remainingTotal <= 0) {
      results.push({
        cursor: { username, userId: oldCursor?.userId ?? "", newestPostId: oldCursor?.newestPostId },
        posts: [],
      });
      continue;
    }

    const user = oldCursor?.userId ? { id: oldCursor.userId, username } : await getUser(username, token);
    const canUseCursor = previous && previous.periodDays >= lookbackDays;
    const effectiveLimit = perAccountPostLimit === null
      ? remainingTotal
      : remainingTotal === null
        ? perAccountPostLimit
        : Math.min(perAccountPostLimit, remainingTotal);
    const result = await getPosts(
      user,
      token,
      lookbackDays,
      effectiveLimit,
      canUseCursor ? oldCursor?.newestPostId : undefined,
    );
    const cursor: XAccountCursor = { username, userId: user.id, newestPostId: result.newestPostId };
    results.push({ cursor, posts: result.posts });
    if (remainingTotal !== null) remainingTotal -= result.posts.length;
  }

  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const merged = new Map<string, RawSocialPost>();
  for (const post of previous?.posts ?? []) {
    if (post.source === "ticker" || post.matchedTickers?.length || new Date(post.postedAt).getTime() >= cutoff) {
      const { mentions: _mentions, translationKo: _translationKo, analyzed: _analyzed, ...raw } = post;
      void _mentions;
      void _translationKo;
      void _analyzed;
      merged.set(post.id, raw);
    }
  }
  for (const result of results) for (const post of result.posts) {
    const existing = merged.get(post.id);
    merged.set(post.id, existing?.matchedTickers?.length ? { ...post, matchedTickers: existing.matchedTickers } : post);
  }

  const accountCounts = new Map<string, number>();
  const accountPosts = [...merged.values()]
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .filter((post) => {
      if (post.source === "ticker") return false;
      if (new Date(post.postedAt).getTime() < cutoff) return false;
      if (perAccountPostLimit === null) return true;
      const count = accountCounts.get(post.username) ?? 0;
      if (count >= perAccountPostLimit) return false;
      accountCounts.set(post.username, count + 1);
      return true;
    })
    .slice(0, totalPostLimit ?? undefined);
  // 계정 타임라인에도 검색 티커가 붙은 동일 게시물이 있을 수 있다. 계정 상한에
  // 걸리더라도 티커 검색 결과에서는 사라지지 않도록 별도로 보존한다.
  const selectedAccountIds = new Set(accountPosts.map((post) => post.id));
  const preservedTickerPosts = [...merged.values()]
    .filter((post) => post.source === "ticker" || Boolean(post.matchedTickers?.length))
    .map((post) => selectedAccountIds.has(post.id) ? post : { ...post, source: "ticker" as const });
  const rawPosts = [...new Map([...accountPosts, ...preservedTickerPosts].map((post) => [post.id, post])).values()]
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt));

  const canReusePreviousAnalysis = previous?.analysisModel === analysisModel;
  const previousPosts = new Map((canReusePreviousAnalysis ? previous?.posts.filter((post) => post.analyzed !== false) : [])?.map((post) => [post.id, post]) ?? []);
  const postsToAnalyze = rawPosts.filter((post) => !previousPosts.has(post.id));
  return {
    analysisModel,
    periodDays: lookbackDays,
    accounts: results.map((result) => result.cursor),
    tickerPeriodDays: previous?.tickerPeriodDays,
    tickers: previous?.tickers,
    rawPosts,
    postsToAnalyze,
    reusedAnalysis: rawPosts.flatMap((post) => {
      const previousPost = previousPosts.get(post.id);
      return previousPost ? [{ id: post.id, mentions: previousPost.mentions, translationKo: previousPost.translationKo ?? "" }] : [];
    }),
  };
}

function tickerQuery(setting: XTickerMonitorSetting): string {
  const cashtag = `$${setting.ticker}`;
  const company = setting.companyName.trim().replaceAll('"', "");
  return `${company ? `(${cashtag} OR "${company}")` : cashtag} -is:retweet -is:reply`;
}

async function getTickerPosts(
  setting: XTickerMonitorSetting,
  token: string,
  lookbackDays: number,
  postLimit: number | null,
  sinceId?: string,
): Promise<{ posts: RawSocialPost[]; newestPostId?: string }> {
  const posts: RawSocialPost[] = [];
  const seenTokens = new Set<string>();
  let paginationToken: string | undefined;
  let newestPostId = sinceId;
  do {
    const remaining = postLimit === null ? 100 : Math.max(0, postLimit - posts.length);
    if (postLimit !== null && remaining === 0) break;
    const params = new URLSearchParams({
      query: tickerQuery(setting),
      max_results: String(Math.min(100, Math.max(10, remaining))),
      expansions: "author_id",
      "tweet.fields": "author_id,created_at,lang",
      "user.fields": "username",
    });
    if (sinceId) params.set("since_id", sinceId);
    else params.set("start_time", new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    if (paginationToken) params.set("next_token", paginationToken);

    const response = await fetchWithTimeout(`https://api.x.com/2/tweets/search/recent?${params}`, {
      headers: authHeaders(token),
      cache: "no-store",
    }, 45_000, `X $${setting.ticker} 검색`);
    const body = await readJsonResponse<XPostsResponse>(response, `X $${setting.ticker} 검색`);
    if (!response.ok) throw new Error(`X $${setting.ticker}: ${body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? response.statusText}`);
    if (!paginationToken) newestPostId = body.meta?.newest_id ?? sinceId;
    const usernames = new Map((body.includes?.users ?? []).map((user) => [user.id, user.username]));
    posts.push(...(body.data ?? []).map((post) => {
      const username = usernames.get(post.author_id ?? "") ?? "unknown";
      return {
        id: post.id,
        username,
        text: post.text,
        postedAt: post.created_at ?? new Date().toISOString(),
        lang: post.lang,
        source: "ticker" as const,
        matchedTickers: [setting.ticker],
        url: `https://x.com/${username}/status/${post.id}`,
      };
    }));
    const nextToken = body.meta?.next_token;
    if (!nextToken || seenTokens.has(nextToken)) break;
    seenTokens.add(nextToken);
    paginationToken = nextToken;
  } while (postLimit === null || posts.length < postLimit);
  return { newestPostId, posts: postLimit === null ? posts : posts.slice(0, postLimit) };
}

export async function prepareXTickerCollection(
  token: string,
  tickerSettings: XTickerMonitorSetting[],
  lookbackDays: number,
  perTickerPostLimit: number | null,
  totalPostLimit: number | null,
  analysisModel: string,
  previous?: DashboardSnapshot["social"],
): Promise<PreparedXCollection> {
  const activeTickers = new Set(tickerSettings.map((setting) => setting.ticker));
  const previousCursors = new Map((previous?.tickers ?? []).map((cursor) => [cursor.ticker, cursor]));
  const fetched = new Map<string, RawSocialPost>();
  const cursors: XTickerCursor[] = [];
  let remainingTotal = totalPostLimit;

  for (const setting of tickerSettings) {
    const oldCursor = previousCursors.get(setting.ticker);
    if (remainingTotal !== null && remainingTotal <= 0) {
      cursors.push({ ticker: setting.ticker, newestPostId: oldCursor?.newestPostId });
      continue;
    }
    const effectiveLimit = perTickerPostLimit === null
      ? remainingTotal
      : remainingTotal === null ? perTickerPostLimit : Math.min(perTickerPostLimit, remainingTotal);
    const canUseCursor = previous && (previous.tickerPeriodDays ?? 0) >= lookbackDays;
    const result = await getTickerPosts(setting, token, lookbackDays, effectiveLimit, canUseCursor ? oldCursor?.newestPostId : undefined);
    cursors.push({ ticker: setting.ticker, newestPostId: result.newestPostId });
    let added = 0;
    for (const post of result.posts) {
      const existing = fetched.get(post.id);
      if (existing) {
        existing.matchedTickers = [...new Set([...(existing.matchedTickers ?? []), setting.ticker])];
      } else {
        fetched.set(post.id, post);
        added += 1;
      }
    }
    if (remainingTotal !== null) remainingTotal -= added;
  }

  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const merged = new Map<string, RawSocialPost>();
  for (const post of previous?.posts ?? []) {
    const { mentions: _mentions, translationKo: _translationKo, analyzed: _analyzed, ...savedRaw } = post;
    void _mentions; void _translationKo; void _analyzed;
    const inTickerWindow = new Date(post.postedAt).getTime() >= cutoff;
    const matchedTickers = inTickerWindow ? (post.matchedTickers ?? []).filter((ticker) => activeTickers.has(ticker)) : [];
    if (post.source === "ticker" && !matchedTickers.length) continue;
    const raw: RawSocialPost = { ...savedRaw, matchedTickers: matchedTickers.length ? matchedTickers : undefined };
    merged.set(post.id, raw);
  }
  for (const post of fetched.values()) {
    const existing = merged.get(post.id);
    merged.set(post.id, existing ? {
      ...post,
      source: existing.source ?? post.source,
      matchedTickers: [...new Set([...(existing.matchedTickers ?? []), ...(post.matchedTickers ?? [])])],
    } : post);
  }
  const rawPosts = [...merged.values()].sort((left, right) => right.postedAt.localeCompare(left.postedAt));
  const canReusePreviousAnalysis = previous?.analysisModel === analysisModel;
  const previousPosts = new Map((canReusePreviousAnalysis ? previous?.posts.filter((post) => post.analyzed !== false) : [])?.map((post) => [post.id, post]) ?? []);
  return {
    analysisModel,
    periodDays: previous?.periodDays ?? 7,
    accounts: previous?.accounts ?? [],
    tickerPeriodDays: lookbackDays,
    tickers: cursors,
    rawPosts,
    postsToAnalyze: rawPosts.filter((post) => !previousPosts.has(post.id)),
    reusedAnalysis: rawPosts.flatMap((post) => {
      const previousPost = previousPosts.get(post.id);
      return previousPost ? [{ id: post.id, mentions: previousPost.mentions, translationKo: previousPost.translationKo ?? "" }] : [];
    }),
  };
}

export function finalizeXCollection(
  prepared: PreparedXCollection,
  newAnalysis: PostAnalysisResult[],
): DashboardSnapshot["social"] {
  const analyses = new Map<string, Omit<PostAnalysisResult, "id">>();
  for (const { id, mentions, translationKo } of prepared.reusedAnalysis) analyses.set(id, { mentions, translationKo });
  for (const { id, mentions, translationKo } of newAnalysis) analyses.set(id, { mentions, translationKo });

  const posts = prepared.rawPosts.map((post): SocialPost => {
    const analysis = analyses.get(post.id);
    return {
      ...post,
      mentions: analysis?.mentions ?? [],
      translationKo: analysis?.translationKo || undefined,
      analyzed: Boolean(analysis),
    };
  });
  return {
    analysisModel: prepared.analysisModel,
    periodDays: prepared.periodDays,
    accounts: prepared.accounts,
    tickerPeriodDays: prepared.tickerPeriodDays,
    tickers: prepared.tickers,
    posts,
    companies: aggregateMentions(posts),
    analyzedPostCount: posts.filter((post) => post.analyzed !== false).length,
  };
}

export function finalizeXCollectionWithoutAnalysis(
  prepared: PreparedXCollection,
  previous?: DashboardSnapshot["social"],
): DashboardSnapshot["social"] {
  const previousPosts = new Map(previous?.posts.map((post) => [post.id, post]) ?? []);
  const posts = prepared.rawPosts.map((post): SocialPost => {
    const saved = previousPosts.get(post.id);
    return {
      ...post,
      mentions: saved?.mentions ?? [],
      translationKo: saved?.translationKo,
      analyzed: saved ? saved.analyzed !== false : false,
    };
  });
  return {
    analysisModel: previous?.analysisModel,
    periodDays: prepared.periodDays,
    accounts: prepared.accounts,
    tickerPeriodDays: prepared.tickerPeriodDays,
    tickers: prepared.tickers,
    posts,
    companies: aggregateMentions(posts),
    analyzedPostCount: posts.filter((post) => post.analyzed !== false).length,
  };
}

export async function collectXData(
  token: string,
  usernames: string[],
  lookbackDays: number,
  perAccountPostLimit: number | null,
  totalPostLimit: number | null,
  openAIApiKey: string,
  analysisModel: string,
  previous?: DashboardSnapshot["social"],
): Promise<DashboardSnapshot["social"]> {
  const prepared = await prepareXCollection(
    token,
    usernames,
    lookbackDays,
    perAccountPostLimit,
    totalPostLimit,
    analysisModel,
    previous,
  );
  const analysis = await analyzePostsWithOpenAI(prepared.postsToAnalyze, openAIApiKey, analysisModel);
  return finalizeXCollection(
    prepared,
    [...analysis].map(([id, value]) => ({ id, ...value })),
  );
}
