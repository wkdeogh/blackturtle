import { analyzeCompanyMarketView, COMPANY_MARKET_VIEW_PROMPT_VERSION } from "@/lib/company-market-view-analysis";
import { refreshErrorMessage } from "@/lib/refresh-runner";
import { failCompanyMarketViewAnalysis, saveCompanyMarketView } from "@/lib/supabase";
import type { CompanyFinancialPayload, MarketCapitalizationItem } from "@/lib/types";

async function analyzeAndSaveCompanyMarketView(
  company: MarketCapitalizationItem,
  financial: CompanyFinancialPayload | null,
  model: string,
  startedAt: string,
) {
  "use step";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("설정되지 않은 환경 변수: OPENAI_API_KEY");
  const marketView = await analyzeCompanyMarketView(company, financial, apiKey, model);
  await saveCompanyMarketView(company.symbol, startedAt, marketView, model, COMPANY_MARKET_VIEW_PROMPT_VERSION);
  return { expectations: marketView.expectations.length, concerns: marketView.concerns.length };
}

// 유료 검색 호출은 응답 유실 뒤 자동 반복하면 중복 과금될 수 있으므로 재시도를 막는다.
analyzeAndSaveCompanyMarketView.maxRetries = 0;

async function saveMarketViewFailure(ticker: string, startedAt: string, message: string) {
  "use step";
  await failCompanyMarketViewAnalysis(ticker, startedAt, message);
}

export async function companyMarketViewWorkflow(
  company: MarketCapitalizationItem,
  financial: CompanyFinancialPayload | null,
  model: string,
  startedAt: string,
) {
  "use workflow";
  try {
    const result = await analyzeAndSaveCompanyMarketView(company, financial, model, startedAt);
    return { ok: true, ...result };
  } catch (error) {
    const message = refreshErrorMessage(error);
    await saveMarketViewFailure(company.symbol, startedAt, message);
    return { ok: false, error: message };
  }
}
