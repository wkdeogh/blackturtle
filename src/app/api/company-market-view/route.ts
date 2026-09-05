import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { isAuthenticated } from "@/lib/auth";
import { COMPANY_MARKET_VIEW_PROMPT_VERSION, isCompanyMarketViewFresh } from "@/lib/company-market-view-analysis";
import { DEFAULT_OPENAI_COMPANY_MARKET_VIEW_MODEL } from "@/lib/openai-config";
import { isSameOriginPost } from "@/lib/session";
import { attachCompanyMarketViewWorkflow, failCompanyMarketViewAnalysis, getCompanyProfileDetail, getInvestorResearchState, seedCompanyProfileMetadata, startCompanyMarketViewAnalysis } from "@/lib/supabase";
import { companyMarketViewWorkflow } from "@/workflows/company-market-views";

function modelName() {
  return process.env.OPENAI_COMPANY_MARKET_VIEW_MODEL?.trim() || DEFAULT_OPENAI_COMPANY_MARKET_VIEW_MODEL;
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  let ticker: string;
  let force: boolean;
  try {
    const body = (await request.json()) as { ticker?: unknown; force?: unknown };
    ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
    force = body.force === true;
    if (!/^[A-Z][A-Z0-9./-]{0,14}$/.test(ticker)) throw new Error();
  } catch {
    return NextResponse.json({ error: "시장 기대·우려 분석 요청이 올바르지 않습니다." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "설정되지 않은 환경 변수: OPENAI_API_KEY" }, { status: 503 });
  }

  try {
    const [research, initialDetail] = await Promise.all([getInvestorResearchState(), getCompanyProfileDetail(ticker)]);
    const company = research.market.marketCapitalization?.items.find((item) => item.symbol === ticker);
    if (!company) return NextResponse.json({ error: "시가총액 TOP200에서 해당 기업을 찾지 못했습니다." }, { status: 404 });
    let detail = initialDetail;
    if (detail.migrationReady && !detail.profile) {
      await seedCompanyProfileMetadata([company]);
      detail = await getCompanyProfileDetail(ticker);
    }
    if (!detail.migrationReady || !detail.profile?.marketViewMigrationReady) {
      return NextResponse.json({ error: "Supabase에서 202609050017_company_market_views.sql을 먼저 실행하세요." }, { status: 503 });
    }

    const current = detail.profile;
    if (current.marketViewStatus === "running" && current.marketViewStartedAt) {
      const age = Date.now() - Date.parse(current.marketViewStartedAt);
      if (Number.isFinite(age) && age < 15 * 60_000) {
        return NextResponse.json({ error: "이 기업의 시장 기대·우려 분석이 이미 진행 중입니다." }, { status: 409 });
      }
      await failCompanyMarketViewAnalysis(ticker, current.marketViewStartedAt, "15분 동안 완료되지 않아 이전 시장 분석을 종료했습니다.");
    }

    const model = modelName();
    if (!force && current.marketViewStatus === "success" && isCompanyMarketViewFresh(current.marketViewAnalyzedAt, current.marketViewPromptVersion, current.marketViewModel, model)) {
      return NextResponse.json({ ok: true, profile: current }, { headers: { "Cache-Control": "no-store" } });
    }

    const startedAt = await startCompanyMarketViewAnalysis(company, model, COMPANY_MARKET_VIEW_PROMPT_VERSION);
    if (!startedAt) {
      return NextResponse.json({ error: "Supabase에서 202609050017_company_market_views.sql을 먼저 실행하세요." }, { status: 503 });
    }

    try {
      const workflowRun = await start(companyMarketViewWorkflow, [company, current.financial, model, startedAt]);
      await attachCompanyMarketViewWorkflow(ticker, startedAt, workflowRun.runId);
      const refreshed = await getCompanyProfileDetail(ticker);
      return NextResponse.json({ ok: true, profile: refreshed.profile }, { status: 202, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1_200) : "시장 기대·우려 Workflow 시작에 실패했습니다.";
      await failCompanyMarketViewAnalysis(ticker, startedAt, message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "시장 기대·우려 분석을 시작하지 못했습니다." }, { status: 500 });
  }
}
