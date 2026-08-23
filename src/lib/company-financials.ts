import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { CompanyFinancialPayload, CompanyFinancialPeriod } from "@/lib/types";

interface SecTickerMapRow { cik_str?: number; ticker?: string; title?: string }
type SecTickerMap = Record<string, SecTickerMapRow>;

interface SecFactUnit {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

interface SecFactConcept { units?: Record<string, SecFactUnit[]> }
interface SecCompanyFacts {
  entityName?: string;
  facts?: Record<string, Record<string, SecFactConcept>>;
}

interface SecSubmissions {
  name?: string;
  filings?: { recent?: {
    accessionNumber?: string[];
    filingDate?: string[];
    form?: string[];
    primaryDocument?: string[];
  } };
}

export interface SecCompanyIdentity {
  ticker: string;
  cik: number;
  name: string;
}

export interface CompanyFinancialCollection {
  ticker: string;
  companyName: string;
  cik: number;
  financial: CompanyFinancialPayload | null;
  checkedAt: string;
  filingAccession: string | null;
  filingForm: string | null;
  filingDate: string | null;
  sourceUrl: string;
}

export interface CompanyNarrativeSource {
  ticker: string;
  companyName: string;
  accession: string;
  form: string;
  filedAt: string;
  sourceUrl: string;
  excerpt: string;
}

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A", "6-K", "6-K/A"]);
const REVENUE_TAGS = [
  ["us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"],
  ["us-gaap", "Revenues"],
  ["us-gaap", "SalesRevenueNet"],
  ["ifrs-full", "Revenue"],
] as const;
const OPERATING_TAGS = [
  ["us-gaap", "OperatingIncomeLoss"],
  ["ifrs-full", "ProfitLossFromOperatingActivities"],
] as const;

function durationDays(unit: SecFactUnit): number {
  if (!unit.start || !unit.end) return Number.NaN;
  return (Date.parse(`${unit.end}T00:00:00Z`) - Date.parse(`${unit.start}T00:00:00Z`)) / 86_400_000;
}

function conceptUnits(body: SecCompanyFacts, tags: ReadonlyArray<readonly [string, string]>) {
  const result: Array<{ currency: string; unit: SecFactUnit }> = [];
  for (const [namespace, tag] of tags) {
    const units = body.facts?.[namespace]?.[tag]?.units ?? {};
    for (const [currency, values] of Object.entries(units)) {
      if (!/^[A-Z]{3}$/.test(currency)) continue;
      for (const unit of values) result.push({ currency, unit });
    }
  }
  return result;
}

function chooseCurrency(body: SecCompanyFacts): string | null {
  const candidates = conceptUnits(body, REVENUE_TAGS);
  if (candidates.some((item) => item.currency === "USD")) return "USD";
  const counts = new Map<string, number>();
  for (const item of candidates) counts.set(item.currency, (counts.get(item.currency) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function selectDurationFacts(
  body: SecCompanyFacts,
  tags: ReadonlyArray<readonly [string, string]>,
  currency: string,
  kind: "annual" | "quarterly",
): SecFactUnit[] {
  const byPeriod = new Map<string, SecFactUnit>();
  for (const entry of conceptUnits(body, tags)) {
    const unit = entry.unit;
    const days = durationDays(unit);
    const validForm = kind === "annual" ? ANNUAL_FORMS.has(unit.form ?? "") : QUARTERLY_FORMS.has(unit.form ?? "");
    const validDays = kind === "annual" ? days >= 250 && days <= 460 : days >= 60 && days <= 120;
    if (entry.currency !== currency || !unit.start || !unit.end || !Number.isFinite(unit.val) || !validForm || !validDays) continue;
    const key = `${unit.start}:${unit.end}`;
    const current = byPeriod.get(key);
    if (!current || (unit.filed ?? "") > (current.filed ?? "")) byPeriod.set(key, unit);
  }
  return [...byPeriod.values()].sort((left, right) => (right.end ?? "").localeCompare(left.end ?? "") || (right.filed ?? "").localeCompare(left.filed ?? ""));
}

function matchingValue(reference: SecFactUnit, candidates: SecFactUnit[]): number | null {
  const exact = candidates.find((unit) => unit.start === reference.start && unit.end === reference.end);
  if (exact && Number.isFinite(exact.val)) return exact.val!;
  const sameEnd = candidates.find((unit) => unit.end === reference.end);
  return sameEnd && Number.isFinite(sameEnd.val) ? sameEnd.val! : null;
}

function period(reference: SecFactUnit, operating: SecFactUnit[]): CompanyFinancialPeriod {
  const revenue = Number.isFinite(reference.val) ? reference.val! : null;
  const operatingIncome = matchingValue(reference, operating);
  return {
    periodEnd: reference.end!,
    filedAt: reference.filed ?? reference.end!,
    form: reference.form ?? "",
    accession: reference.accn ?? "",
    revenue,
    operatingIncome,
    operatingMarginPercent: revenue && operatingIncome !== null ? (operatingIncome / revenue) * 100 : null,
  };
}

export function parseCompanyFinancialFacts(body: SecCompanyFacts): { companyName: string; financial: CompanyFinancialPayload | null; latest: CompanyFinancialPeriod | null } {
  const currency = chooseCurrency(body);
  if (!currency) return { companyName: body.entityName ?? "", financial: null, latest: null };
  const annualRevenue = selectDurationFacts(body, REVENUE_TAGS, currency, "annual");
  const annualOperating = selectDurationFacts(body, OPERATING_TAGS, currency, "annual");
  const quarterlyRevenue = selectDurationFacts(body, REVENUE_TAGS, currency, "quarterly");
  const quarterlyOperating = selectDurationFacts(body, OPERATING_TAGS, currency, "quarterly");
  const annual = annualRevenue.slice(0, 4).map((item) => period(item, annualOperating));
  const quarterly = quarterlyRevenue.slice(0, 8).map((item) => period(item, quarterlyOperating));
  const latest = [...annual, ...quarterly].sort((left, right) => right.filedAt.localeCompare(left.filedAt))[0] ?? null;
  return {
    companyName: body.entityName ?? "",
    financial: annual.length || quarterly.length ? { currency, annual, quarterly } : null,
    latest,
  };
}

async function fetchSecJson<T>(url: string, userAgent: string, label: string): Promise<T> {
  const response = await fetchWithTimeout(url, {
    cache: "no-store",
    headers: { "User-Agent": userAgent, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
  }, 45_000, label);
  const body = await readJsonResponse<T>(response, label);
  if (!response.ok) throw new Error(`${label} 실패 (${response.status}): ${response.statusText}`);
  return body;
}

export async function resolveSecCompanyIdentities(tickers: string[], userAgent: string): Promise<SecCompanyIdentity[]> {
  const body = await fetchSecJson<SecTickerMap>("https://www.sec.gov/files/company_tickers.json", userAgent, "SEC 티커 목록");
  const requested = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  return Object.values(body).flatMap((row) => {
    const ticker = row.ticker?.toUpperCase();
    return ticker && requested.has(ticker) && Number.isFinite(row.cik_str)
      ? [{ ticker, cik: row.cik_str!, name: row.title ?? ticker }]
      : [];
  });
}

export async function fetchCompanyFinancials(company: SecCompanyIdentity, userAgent: string): Promise<CompanyFinancialCollection> {
  const padded = String(company.cik).padStart(10, "0");
  const body = await fetchSecJson<SecCompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`,
    userAgent,
    `SEC ${company.ticker} 재무정보`,
  );
  const parsed = parseCompanyFinancialFacts(body);
  return {
    ticker: company.ticker,
    companyName: parsed.companyName || company.name,
    cik: company.cik,
    financial: parsed.financial,
    checkedAt: new Date().toISOString(),
    filingAccession: parsed.latest?.accession || null,
    filingForm: parsed.latest?.form || null,
    filingDate: parsed.latest?.filedAt || null,
    sourceUrl: `https://www.sec.gov/edgar/browse/?CIK=${company.cik}`,
  };
}

function decodeHtml(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return text
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&([a-z]+);/gi, (match, value: string) => named[value.toLowerCase()] ?? match);
}

function plainFilingText(html: string): string {
  return decodeHtml(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function narrativeExcerpt(text: string): string {
  const lower = text.toLowerCase();
  const businessMarkers = ["item 1. business", "item 1 — business", "item 4. information on the company", "description of business"];
  const businessStart = businessMarkers.map((marker) => lower.indexOf(marker)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const chunks = [text.slice(businessStart, businessStart + 18_000)];
  const researchMarkers = ["research and development", "research & development", "r&d"];
  const used = new Set<number>();
  for (const marker of researchMarkers) {
    let offset = 0;
    while (chunks.length < 4) {
      const index = lower.indexOf(marker, offset);
      if (index < 0) break;
      offset = index + marker.length;
      const bucket = Math.floor(index / 2_000);
      if (used.has(bucket)) continue;
      used.add(bucket);
      chunks.push(text.slice(Math.max(0, index - 1_500), index + 3_500));
    }
  }
  return chunks.join("\n\n[…관련 공시 구간…]\n\n").slice(0, 30_000);
}

export async function fetchCompanyNarrativeSource(company: SecCompanyIdentity, userAgent: string): Promise<CompanyNarrativeSource> {
  const padded = String(company.cik).padStart(10, "0");
  const submissions = await fetchSecJson<SecSubmissions>(
    `https://data.sec.gov/submissions/CIK${padded}.json`,
    userAgent,
    `SEC ${company.ticker} 제출내역`,
  );
  const recent = submissions.filings?.recent;
  const forms = recent?.form ?? [];
  const index = forms.findIndex((form) => ANNUAL_FORMS.has(form));
  if (index < 0) throw new Error(`${company.ticker}: 최근 10-K·20-F를 찾지 못했습니다.`);
  const accession = recent?.accessionNumber?.[index] ?? "";
  const primaryDocument = recent?.primaryDocument?.[index] ?? "";
  const filedAt = recent?.filingDate?.[index] ?? "";
  const form = forms[index] ?? "";
  if (!accession || !primaryDocument || !filedAt) throw new Error(`${company.ticker}: 공시 문서 주소가 비어 있습니다.`);
  const accessionPath = accession.replaceAll("-", "");
  const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionPath}/${primaryDocument}`;
  const response = await fetchWithTimeout(sourceUrl, {
    cache: "no-store",
    headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "gzip, deflate" },
  }, 60_000, `SEC ${company.ticker} 사업보고서`);
  if (!response.ok) throw new Error(`${company.ticker}: 사업보고서 수집 실패 (${response.status})`);
  const text = plainFilingText(await response.text());
  if (text.length < 1_000) throw new Error(`${company.ticker}: 사업보고서 본문이 너무 짧습니다.`);
  return {
    ticker: company.ticker,
    companyName: submissions.name ?? company.name,
    accession,
    form,
    filedAt,
    sourceUrl,
    excerpt: narrativeExcerpt(text),
  };
}
