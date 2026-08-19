import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { EarningsCalendarEvent } from "@/lib/types";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function collectEarningsCalendar(apiKey: string, tickers: string[]): Promise<EarningsCalendarEvent[]> {
  const params = new URLSearchParams({ function: "EARNINGS_CALENDAR", horizon: "3month", apikey: apiKey });
  const response = await fetchWithTimeout(`https://www.alphavantage.co/query?${params}`, { cache: "no-store" }, 40_000, "Alpha Vantage 실적 일정");
  const raw = await response.text();
  if (!response.ok) throw new Error(response.statusText);
  if (!raw.trim()) throw new Error("빈 CSV 응답입니다.");
  if (/Thank you for using Alpha Vantage|rate limit|premium/i.test(raw.slice(0, 600))) throw new Error(raw.slice(0, 260));
  const rows = parseCsv(raw);
  const header = rows.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  const column = (name: string) => header.indexOf(name);
  const symbols = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  return rows.flatMap((row): EarningsCalendarEvent[] => {
    const ticker = row[column("symbol")]?.trim().toUpperCase() ?? "";
    const reportDate = row[column("reportdate")]?.trim() ?? "";
    if (!symbols.has(ticker) || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return [];
    const estimateRaw = Number(row[column("estimate")]);
    return [{
      ticker,
      companyName: row[column("name")]?.trim() || undefined,
      reportDate,
      fiscalDateEnding: row[column("fiscaldateending")]?.trim() || undefined,
      estimate: Number.isFinite(estimateRaw) ? estimateRaw : null,
      currency: row[column("currency")]?.trim() || undefined,
      source: "Alpha Vantage",
    }];
  }).sort((left, right) => left.reportDate.localeCompare(right.reportDate));
}
