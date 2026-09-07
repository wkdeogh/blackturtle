import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { EconomicCalendarEvent } from "@/lib/types";

interface FredReleaseDatesResponse {
  release_dates?: Array<{ release_id?: number; release_name?: string; date?: string }>;
  error_message?: string;
}

const RELEASE_RULES: Array<{ pattern: RegExp; category: EconomicCalendarEvent["category"] }> = [
  { pattern: /consumer price|producer price|personal income and outlays|import and export price/i, category: "inflation" },
  { pattern: /employment situation|job openings|unemployment insurance|labor turnover/i, category: "employment" },
  { pattern: /gross domestic product|industrial production|retail sales|business cycle/i, category: "growth" },
  { pattern: /federal open market committee|fomc|minutes of the federal/i, category: "fed" },
];

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function collectEconomicCalendar(apiKey: string, now = new Date()): Promise<EconomicCalendarEvent[]> {
  const start = now.toISOString().slice(0, 10);
  const end = addDays(now, 60);
  const params = new URLSearchParams({
    api_key: apiKey,
    file_type: "json",
    realtime_start: start,
    realtime_end: end,
    include_release_dates_with_no_data: "true",
    sort_order: "asc",
    limit: "250",
  });
  const response = await fetchWithTimeout(`https://api.stlouisfed.org/fred/releases/dates?${params}`, {
    cache: "no-store",
  }, 30_000, "FRED 경제 이벤트");
  const body = await readJsonResponse<FredReleaseDatesResponse>(response, "FRED 경제 이벤트");
  if (!response.ok || body.error_message) throw new Error(body.error_message ?? response.statusText);

  const events: EconomicCalendarEvent[] = [];
  const seen = new Set<string>();
  for (const release of body.release_dates ?? []) {
    const name = release.release_name?.trim() ?? "";
    const date = release.date?.slice(0, 10) ?? "";
    const rule = RELEASE_RULES.find((candidate) => candidate.pattern.test(name));
    if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const id = `${release.release_id ?? name}:${date}`;
    if (seen.has(id)) continue;
    seen.add(id);
    events.push({ id, date, name, category: rule.category, source: "FRED" });
  }
  return events.slice(0, 40);
}
