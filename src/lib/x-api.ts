import { aggregateMentions, analyzePostsWithOpenAI } from "@/lib/social-analysis";
import type { DashboardSnapshot, SocialPost, XAccountCursor } from "@/lib/types";

interface XUserResponse {
  data?: { id: string; username: string };
  errors?: Array<{ detail?: string; title?: string }>;
}

interface XPostsResponse {
  data?: Array<{ id: string; text: string; created_at?: string; lang?: string }>;
  meta?: { newest_id?: string; next_token?: string };
  errors?: Array<{ detail?: string; title?: string }>;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function getUser(username: string, token: string): Promise<{ id: string; username: string }> {
  const response = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, {
    headers: authHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as XUserResponse;
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
): Promise<{ posts: Array<Omit<SocialPost, "mentions">>; newestPostId?: string }> {
  const posts: Array<Omit<SocialPost, "mentions">> = [];
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

    const response = await fetch(`https://api.x.com/2/users/${user.id}/tweets?${params}`, {
      headers: authHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as XPostsResponse;
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
  const previousCursors = new Map(previous?.accounts.map((account) => [account.username.toLowerCase(), account]) ?? []);
  const results: Array<{ cursor: XAccountCursor; posts: Array<Omit<SocialPost, "mentions">> }> = [];
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
  const merged = new Map<string, Omit<SocialPost, "mentions">>();
  for (const post of previous?.posts ?? []) {
    if (new Date(post.postedAt).getTime() >= cutoff) {
      const { mentions: _mentions, ...raw } = post;
      void _mentions;
      merged.set(post.id, raw);
    }
  }
  for (const result of results) for (const post of result.posts) merged.set(post.id, post);

  const accountCounts = new Map<string, number>();
  const rawPosts = [...merged.values()]
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .filter((post) => {
      if (perAccountPostLimit === null) return true;
      const count = accountCounts.get(post.username) ?? 0;
      if (count >= perAccountPostLimit) return false;
      accountCounts.set(post.username, count + 1);
      return true;
    })
    .slice(0, totalPostLimit ?? undefined);

  const canReusePreviousAnalysis = previous?.analysisModel === analysisModel;
  const previousPosts = new Map((canReusePreviousAnalysis ? previous?.posts : [])?.map((post) => [post.id, post]) ?? []);
  const postsToAnalyze = rawPosts.filter((post) => !previousPosts.has(post.id));
  const newAnalysis = await analyzePostsWithOpenAI(postsToAnalyze, openAIApiKey, analysisModel);
  const posts = rawPosts.map((post): SocialPost => {
    const previousPost = previousPosts.get(post.id);
    if (previousPost) return { ...post, mentions: previousPost.mentions };
    return { ...post, mentions: newAnalysis.get(post.id) ?? [] };
  });

  return {
    analysisModel,
    periodDays: lookbackDays,
    accounts: results.map((result) => result.cursor),
    posts,
    companies: aggregateMentions(posts),
    analyzedPostCount: posts.length,
  };
}
