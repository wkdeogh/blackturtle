import type { CompanyNarrativeSource } from "@/lib/company-financials";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import { OPENAI_COMPANY_PROFILE_REASONING_EFFORT } from "@/lib/openai-config";
import type { CompanyFinancialPayload, CompanyProfileNarrative, MarketCapitalizationItem } from "@/lib/types";

interface OpenAIResponse {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  output_text?: string;
  error?: { message?: string };
  incomplete_details?: { reason?: string };
}

export const COMPANY_PROFILE_PROMPT_VERSION = 1;
export const COMPANY_PROFILE_MAX_OUTPUT_TOKENS = 1_600;
export const COMPANY_PROFILE_ESTIMATED_INPUT_TOKENS = 8_000;

const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    revenueItems: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, description: { type: "string" } },
        required: ["title", "description"],
      },
    },
    growthAndResearch: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, description: { type: "string" } },
        required: ["title", "description"],
      },
    },
  },
  required: ["overview", "revenueItems", "growthAndResearch"],
} as const;

function outputText(body: OpenAIResponse): string | null {
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text.trim();
    }
  }
  return null;
}

function compactFinancial(financial: CompanyFinancialPayload | null) {
  if (!financial) return null;
  return {
    currency: financial.currency,
    annual: financial.annual.slice(0, 3),
    quarterly: financial.quarterly.slice(0, 5),
  };
}

export async function analyzeCompanyProfile(
  company: MarketCapitalizationItem,
  financial: CompanyFinancialPayload | null,
  source: CompanyNarrativeSource,
  apiKey: string,
  model: string,
): Promise<CompanyProfileNarrative> {
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: OPENAI_COMPANY_PROFILE_REASONING_EFFORT },
      max_output_tokens: COMPANY_PROFILE_MAX_OUTPUT_TOKENS,
      instructions: `You are a source-grounded public-company research editor. Write concise Korean for an investor dashboard.

Rules:
- Use only the supplied SEC filing excerpt, company metadata, and structured financial data.
- Never invent products, customers, market shares, strategies, research programs, dates, or financial figures.
- Describe what the company does in 3-5 Korean sentences.
- Revenue items must identify the main products, services, platforms, or business groups that generate revenue. If the filing excerpt is insufficient, say that it is not confirmed in the supplied filing.
- Growth and research items must separate disclosed management direction from your inference. Do not turn generic risks into company plans.
- Avoid investment recommendations, target prices, promotional language, and repetitive wording.
- Keep every item title short and every description to 1-2 sentences.`,
      input: JSON.stringify({
        company: {
          ticker: company.symbol,
          name: company.name,
          sector: company.sector,
          industry: company.industry,
          country: company.country,
        },
        financial: compactFinancial(financial),
        source: {
          form: source.form,
          filedAt: source.filedAt,
          accession: source.accession,
          excerpt: source.excerpt,
        },
      }),
      text: {
        format: {
          type: "json_schema",
          name: "company_profile",
          strict: true,
          schema: PROFILE_SCHEMA,
        },
      },
    }),
  }, 300_000, `OpenAI ${model} ${company.symbol} 기업 분석`);
  const body = await readJsonResponse<OpenAIResponse>(response, `OpenAI ${model} ${company.symbol} 기업 분석`);
  if (!response.ok) throw new Error(`OpenAI ${company.symbol} 분석 실패 (${response.status}): ${(body.error?.message ?? response.statusText).slice(0, 400)}`);
  const text = outputText(body);
  if (!text) throw new Error(`OpenAI ${company.symbol} 분석 결과가 비어 있습니다${body.incomplete_details?.reason ? `: ${body.incomplete_details.reason}` : "."}`);
  try {
    return JSON.parse(text) as CompanyProfileNarrative;
  } catch {
    throw new Error(`OpenAI ${company.symbol} 분석 결과 JSON을 읽지 못했습니다.`);
  }
}
