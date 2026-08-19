import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin, getXTickerMonitorSettings } from "@/lib/supabase";
import { MAX_ACTIVE_X_TICKERS, MAX_SAVED_X_TICKERS } from "@/lib/x-ticker-limits";

interface TickerInput {
  ticker: string;
  companyName: string;
  enabled: boolean;
}

function normalizeTickers(values: unknown): TickerInput[] | null {
  if (!Array.isArray(values)) return null;
  const tickers = values.map((value): TickerInput | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.ticker !== "string" || typeof raw.enabled !== "boolean") return null;
    const companyName = typeof raw.companyName === "string" ? raw.companyName.trim().replace(/\s+/g, " ") : "";
    return { ticker: raw.ticker.trim().replace(/^\$/, "").toUpperCase(), companyName, enabled: raw.enabled };
  });
  if (tickers.some((ticker) => ticker === null)) return null;
  const normalized = tickers as TickerInput[];
  if (normalized.length > MAX_SAVED_X_TICKERS || normalized.filter(({ enabled }) => enabled).length > MAX_ACTIVE_X_TICKERS) return null;
  if (normalized.some(({ ticker, companyName }) => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) || companyName.length > 80)) return null;
  if (new Set(normalized.map(({ ticker }) => ticker)).size !== normalized.length) return null;
  return normalized;
}

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json(await getXTickerMonitorSettings(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "X 티커 설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  let tickers: TickerInput[] | null = null;
  try {
    const body = (await request.json()) as { tickers?: unknown };
    tickers = normalizeTickers(body.tickers);
  } catch {
    // Normalized validation response below.
  }
  if (!tickers) {
    return NextResponse.json({ error: `티커는 최대 ${MAX_SAVED_X_TICKERS}개까지 저장하고 ${MAX_ACTIVE_X_TICKERS}개까지 활성화할 수 있습니다.` }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  const { error } = await supabase.rpc("replace_x_monitored_tickers_v1", {
    p_tickers: tickers.map(({ ticker }) => ticker),
    p_company_names: tickers.map(({ companyName }) => companyName),
    p_enabled: tickers.map(({ enabled }) => enabled),
  });
  if (error) {
    const missing = error.message.includes("replace_x_monitored_tickers_v1") || error.code === "PGRST202";
    return NextResponse.json({ error: missing ? "Supabase에서 202608190013_x_ticker_monitoring.sql을 먼저 실행하세요." : `티커 저장 실패: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tickers });
}
