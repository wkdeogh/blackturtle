import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeXCollectionWithoutAnalysis, prepareXCollection } from "@/lib/x-api";
import type { DashboardSnapshot } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

describe("X cursor safety", () => {
  it("starts from the requested time window when an old cursor has no saved posts in range", async () => {
    const now = new Date();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const params = new URL(String(input)).searchParams;
      const stale = params.has("since_id") || params.has("until_id");
      return new Response(JSON.stringify({
        data: [{ id: stale ? "101" : "301", text: stale ? "expired" : "recent", created_at: new Date(now.getTime() - (stale ? 3 : 0.5) * 86_400_000).toISOString() }],
        meta: { newest_id: stale ? "101" : "301" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const previous: DashboardSnapshot["social"] = {
      periodDays: 1,
      accounts: [{ username: "sample", userId: "1", newestPostId: "100", pendingNewestPostId: "200", backfillUntilId: "150" }],
      posts: [], companies: [], analyzedPostCount: 0,
    };

    const prepared = await prepareXCollection("token", ["sample"], 1, 10, 10, "gpt-test", previous);
    const params = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    expect(params.has("start_time")).toBe(true);
    expect(params.has("since_id")).toBe(false);
    expect(params.has("until_id")).toBe(false);
    expect(prepared.rawPosts.map((post) => post.id)).toEqual(["301"]);
    expect(prepared.accounts[0]).toMatchObject({ newestPostId: "301" });
  });

  it("keeps previously displayed posts when the new collection has no posts in range", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ meta: { result_count: 0 } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const previous: DashboardSnapshot["social"] = {
      periodDays: 1,
      accounts: [{ username: "sample", userId: "1", newestPostId: "100" }],
      posts: [{ id: "100", username: "sample", text: "saved post", postedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), url: "https://x.com/sample/status/100", mentions: [], analyzed: true }],
      companies: [], analyzedPostCount: 1,
    };

    const prepared = await prepareXCollection("token", ["sample"], 1, 10, 10, "gpt-test", previous);
    expect(prepared.rawPosts.map((post) => post.id)).toEqual(["100"]);
    const saved = finalizeXCollectionWithoutAnalysis(prepared, previous);
    expect(saved.posts.map((post) => post.id)).toEqual(["100"]);
    expect(saved.posts[0]?.analyzed).toBe(true);
    expect(prepared.collectionMetrics.targetsFailed).toBe(0);
    expect(prepared.collectionWarnings).toContain("수집 기간 내 게시물이 없어 이전 계정 데이터를 유지했습니다.");
  });

  it("does not discard a skipped target's pending backfill cursor when the global cap is reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "101", text: "new post", created_at: new Date().toISOString(), lang: "en" }],
      meta: { newest_id: "101" },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const previous: DashboardSnapshot["social"] = {
      analysisModel: "gpt-test",
      analysisPromptVersion: "old",
      periodDays: 7,
      accounts: [
        { username: "first", userId: "1", newestPostId: "100" },
        { username: "second", userId: "2", newestPostId: "200", pendingNewestPostId: "250", backfillUntilId: "225" },
      ],
      posts: [], companies: [], analyzedPostCount: 0,
    };

    const prepared = await prepareXCollection("token", ["first", "second"], 7, 10, 1, "gpt-test", previous);
    expect(prepared.collectionMetrics.apiCalls).toBe(1);
    expect(prepared.accounts[1]).toMatchObject({ newestPostId: "200", pendingNewestPostId: "250", backfillUntilId: "225" });
  });
});
