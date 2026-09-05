import { describe, expect, it } from "vitest";
import { isCompanyMarketViewFresh, normalizeCompanyMarketView, openAIWebSourceUrls } from "@/lib/company-market-view-analysis";

describe("company market view analysis", () => {
  it("OpenAI 웹 검색이 실제로 반환한 URL이 있는 주장만 유지한다", () => {
    const allowed = new Set(["https://example.com/article"]);
    const result = normalizeCompanyMarketView({
      asOf: "2026-09-05",
      headline: "핵심 쟁점",
      expectations: [
        { title: "검증된 기대", summary: "설명", whyItMatters: "영향", watchFor: "확인점", sourceIds: ["s1"] },
        { title: "출처 없는 기대", summary: "설명", whyItMatters: "영향", watchFor: "확인점", sourceIds: ["missing"] },
      ],
      concerns: [],
      sources: [
        { id: "s1", title: "Example", url: "https://example.com/article?utm_source=test", publishedAt: "2026-09-01", sourceType: "news" },
        { id: "s2", title: "Invented", url: "https://invalid.example/story", publishedAt: "2026-09-01", sourceType: "news" },
      ],
      limitations: "",
    }, allowed);

    expect(result.sources.map((source) => source.id)).toEqual(["s1"]);
    expect(result.expectations.map((item) => item.title)).toEqual(["검증된 기대"]);
  });

  it("검색 호출과 URL citation 모두에서 출처 URL을 수집한다", () => {
    const urls = openAIWebSourceUrls({ output: [
      { type: "web_search_call", action: { sources: [{ url: "https://example.com/a?x=1" }] } },
      { type: "message", content: [{ type: "output_text", text: "{}", annotations: [{ type: "url_citation", url: "https://example.com/b#section" }] }] },
    ] });
    expect([...urls]).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("같은 모델과 프롬프트의 7일 미만 결과만 최신으로 판단한다", () => {
    const now = Date.parse("2026-09-05T00:00:00Z");
    expect(isCompanyMarketViewFresh("2026-08-30T00:00:01Z", 1, "gpt-5.6-luna", "gpt-5.6-luna", now)).toBe(true);
    expect(isCompanyMarketViewFresh("2026-08-29T00:00:00Z", 1, "gpt-5.6-luna", "gpt-5.6-luna", now)).toBe(false);
    expect(isCompanyMarketViewFresh("2026-09-04T00:00:00Z", 0, "gpt-5.6-luna", "gpt-5.6-luna", now)).toBe(false);
  });
});
