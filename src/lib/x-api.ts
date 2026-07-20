import { aggregateMentions, analyzePost } from "@/lib/social-analysis";
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
  sinceId?: string,
): Promise<{ posts: Array<Omit<SocialPost, "mentions">>; newestPostId?: string }> {
  const params = new URLSearchParams({
    max_results: "100",
    exclude: "replies,retweets",
    "tweet.fields": "created_at,lang",
  });
  if (sinceId) {
    params.set("since_id", sinceId);
  } else {
    params.set("start_time", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  }

  const response = await fetch(`https://api.x.com/2/users/${user.id}/tweets?${params}`, {
    headers: authHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as XPostsResponse;
  if (!response.ok) {
    throw new Error(`X @${user.username}: ${body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? response.statusText}`);
  }
  return {
    newestPostId: body.meta?.newest_id ?? sinceId,
    posts: (body.data ?? []).map((post) => ({
      id: post.id,
      username: user.username,
      text: post.text,
      postedAt: post.created_at ?? new Date().toISOString(),
      lang: post.lang,
      url: `https://x.com/${user.username}/status/${post.id}`,
    })),
  };
}

export async function collectXData(
  token: string,
  usernames: string[],
  previous?: DashboardSnapshot["social"],
): Promise<DashboardSnapshot["social"]> {
  const previousCursors = new Map(previous?.accounts.map((account) => [account.username.toLowerCase(), account]) ?? []);
  const results = await Promise.all(
    usernames.map(async (username) => {
      const oldCursor = previousCursors.get(username.toLowerCase());
      const user = oldCursor?.userId ? { id: oldCursor.userId, username } : await getUser(username, token);
      const result = await getPosts(user, token, oldCursor?.newestPostId);
      const cursor: XAccountCursor = { username, userId: user.id, newestPostId: result.newestPostId };
      return { cursor, posts: result.posts };
    }),
  );

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const merged = new Map<string, Omit<SocialPost, "mentions">>();
  for (const post of previous?.posts ?? []) {
    if (new Date(post.postedAt).getTime() >= cutoff) {
      const { mentions: _mentions, ...raw } = post;
      void _mentions;
      merged.set(post.id, raw);
    }
  }
  for (const result of results) for (const post of result.posts) merged.set(post.id, post);

  const posts = [...merged.values()]
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .slice(0, 500)
    .map(analyzePost);

  return {
    periodDays: 7,
    accounts: results.map((result) => result.cursor),
    posts,
    companies: aggregateMentions(posts),
    analyzedPostCount: posts.length,
  };
}
