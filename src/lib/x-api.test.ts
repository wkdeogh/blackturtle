import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareXCollection } from "@/lib/x-api";
import type { DashboardSnapshot } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

describe("X cursor safety", () => {
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
