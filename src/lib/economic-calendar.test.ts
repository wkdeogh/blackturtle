import { expect, it, vi } from "vitest";
import { collectEconomicCalendar } from "@/lib/economic-calendar";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

vi.mock("@/lib/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));

it("requests the US current day even after UTC midnight", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response(JSON.stringify({ release_dates: [] })));
  await collectEconomicCalendar("test-key", new Date("2026-09-08T02:00:00Z"));
  const url = new URL(String(vi.mocked(fetchWithTimeout).mock.calls[0][0]));
  expect(url.searchParams.get("realtime_start")).toBe("2026-09-07");
  expect(url.searchParams.get("realtime_end")).toBe("2026-11-06");
});
