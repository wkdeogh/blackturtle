import { describe, expect, it } from "vitest";
import { parseDashboardSnapshot } from "@/lib/snapshot-schema";

const valid = {
  version: 1,
  generatedAt: "2026-08-19T00:00:00.000Z",
  macro: [],
  social: { periodDays: 7, accounts: [], posts: [], companies: [], analyzedPostCount: 0 },
};

describe("snapshot runtime validation", () => {
  it("accepts a minimal stored snapshot", () => expect(parseDashboardSnapshot(valid)).toEqual(valid));
  it("rejects corrupted numeric fields before UI rendering", () => {
    expect(() => parseDashboardSnapshot({ ...valid, social: { ...valid.social, periodDays: "seven" } })).toThrow(/스냅샷 형식/);
  });
});
