import { expect, it, vi } from "vitest";
import { collectEarningsCalendar } from "@/lib/earnings-calendar";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

vi.mock("@/lib/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));

it("distinguishes missing estimates from actual zero and negative EPS", async () => {
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response('symbol,name,reportDate,estimate,currency\nAAPL,Apple,2026-09-10,,USD\nMSFT,Microsoft,2026-09-11,0,USD\nAMD,AMD,2026-09-12,-0.25,USD'));
  const events = await collectEarningsCalendar("test-key", ["AAPL", "MSFT", "AMD"]);
  expect(events.map((event) => event.estimate)).toEqual([null, 0, -0.25]);
});
