import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { CftcPositioningSeries } from "@/lib/types";

interface PositionDefinition { id: string; label: string; code: string }
interface CftcRow {
  cftc_contract_market_code?: string;
  report_date_as_yyyy_mm_dd?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
  open_interest_all?: string;
}

const DEFINITIONS: PositionDefinition[] = [
  { id: "CFTC_WTI", label: "WTI 원유", code: "067651" },
  { id: "CFTC_GOLD", label: "금", code: "088691" },
  { id: "CFTC_SP500", label: "E-mini S&P 500", code: "13874A" },
  { id: "CFTC_DOLLAR", label: "미 달러 인덱스", code: "098662" },
  { id: "CFTC_BITCOIN", label: "비트코인", code: "133741" },
];

function percentile(values: number[], current: number): number | null {
  if (values.length < 20) return null;
  return Math.round((values.filter((value) => value <= current).length / values.length) * 100);
}

export async function collectCftcPositioning(): Promise<CftcPositioningSeries[]> {
  const params = new URLSearchParams({
    "$limit": "1000",
    "$select": "cftc_contract_market_code,report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all",
    "$where": `cftc_contract_market_code in (${DEFINITIONS.map((item) => `'${item.code}'`).join(",")})`,
    "$order": "report_date_as_yyyy_mm_dd DESC",
  });
  const response = await fetchWithTimeout(`https://publicreporting.cftc.gov/resource/6dca-aqww.json?${params}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }, 40_000, "CFTC COT 포지셔닝");
  const rows = await readJsonResponse<CftcRow[]>(response, "CFTC COT 포지셔닝");
  if (!response.ok) throw new Error(response.statusText);

  return DEFINITIONS.flatMap((definition) => {
    const points = rows.filter((row) => row.cftc_contract_market_code === definition.code).flatMap((row) => {
      const date = row.report_date_as_yyyy_mm_dd?.slice(0, 10) ?? "";
      const long = Number(row.noncomm_positions_long_all);
      const short = Number(row.noncomm_positions_short_all);
      const openInterest = Number(row.open_interest_all);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(long) && Number.isFinite(short) && Number.isFinite(openInterest)
        ? [{ date, net: long - short, openInterest }]
        : [];
    }).sort((left, right) => left.date.localeCompare(right.date)).slice(-156);
    if (!points.length) return [];
    const current = points.at(-1)!;
    const previous = points.at(-2)?.net ?? null;
    return [{
      id: definition.id,
      label: definition.label,
      contractCode: definition.code,
      observationDate: current.date,
      netNonCommercial: current.net,
      previousNet: previous,
      openInterest: current.openInterest,
      netPercentOfOpenInterest: current.openInterest === 0 ? null : (current.net / current.openInterest) * 100,
      percentile3Y: percentile(points.map((point) => point.net), current.net),
      points,
    }];
  });
}
