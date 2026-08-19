import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonResponse } from "@/lib/http-json";
import type { CompanyFundamentalSnapshot, SecFiling } from "@/lib/types";

interface SecTickerMapRow { cik_str?: number; ticker?: string; title?: string }
type SecTickerMap = Record<string, SecTickerMapRow>;

interface SecSubmissions {
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
    };
  };
}

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

interface SecCompanyFacts {
  entityName?: string;
  facts?: { "us-gaap"?: Record<string, { units?: Record<string, SecFactUnit[]> }> };
}

const FORMS = new Set(["8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A", "20-F", "6-K", "4", "4/A"]);

function importance(form: string): SecFiling["importance"] {
  if (form.startsWith("8-K") || form.startsWith("10-Q") || form.startsWith("10-K")) return "high";
  if (form === "20-F" || form === "6-K" || form.startsWith("4")) return "medium";
  return "low";
}

function factUnits(body: SecCompanyFacts, tags: string[]): SecFactUnit[] {
  const facts = body.facts?.["us-gaap"] ?? {};
  for (const tag of tags) {
    const units = facts[tag]?.units?.USD;
    if (units?.length) return units;
  }
  return [];
}

function annualFacts(body: SecCompanyFacts, tags: string[]) {
  const byEnd = new Map<string, SecFactUnit>();
  for (const unit of factUnits(body, tags)) {
    if (!unit.start || !unit.end || !Number.isFinite(unit.val) || (unit.form !== "10-K" && unit.form !== "20-F" && unit.form !== "40-F")) continue;
    const days = (Date.parse(`${unit.end}T00:00:00Z`) - Date.parse(`${unit.start}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(days) || days < 250 || days > 460) continue;
    const current = byEnd.get(unit.end);
    if (!current || (unit.filed ?? "") > (current.filed ?? "")) byEnd.set(unit.end, unit);
  }
  return [...byEnd.values()].sort((left, right) => (right.end ?? "").localeCompare(left.end ?? ""));
}

function latestInstant(body: SecCompanyFacts, tags: string[]): number | null {
  const units = factUnits(body, tags)
    .filter((unit) => unit.end && Number.isFinite(unit.val) && ["10-K", "10-Q", "20-F", "40-F", "6-K"].includes(unit.form ?? ""))
    .sort((left, right) => (right.filed ?? right.end ?? "").localeCompare(left.filed ?? left.end ?? ""));
  return units[0]?.val ?? null;
}

function growth(current: number | null, previous: number | null): number | null {
  return current === null || previous === null || previous === 0 ? null : ((current / previous) - 1) * 100;
}

async function fetchCompanyFundamentals(ticker: string, cik: number, userAgent: string): Promise<CompanyFundamentalSnapshot | null> {
  const padded = String(cik).padStart(10, "0");
  const response = await fetchWithTimeout(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`, {
    cache: "no-store",
    headers: { "User-Agent": userAgent, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
  }, 35_000, `SEC ${ticker} 재무정보`);
  const body = await readJsonResponse<SecCompanyFacts>(response, `SEC ${ticker} 재무정보`);
  if (!response.ok) throw new Error(response.statusText);
  const revenues = annualFacts(body, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"]);
  const operating = annualFacts(body, ["OperatingIncomeLoss"]);
  const netIncome = annualFacts(body, ["NetIncomeLoss", "ProfitLoss"]);
  const cashFlow = annualFacts(body, ["NetCashProvidedByUsedInOperatingActivities"]);
  const capex = annualFacts(body, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForAdditionsToPropertyPlantAndEquipment"]);
  const reference = revenues[0] ?? operating[0] ?? netIncome[0] ?? cashFlow[0];
  if (!reference?.end) return null;
  const valueAt = (units: SecFactUnit[]) => units.find((unit) => unit.end === reference.end)?.val ?? units[0]?.val ?? null;
  const revenue = valueAt(revenues);
  const operatingIncome = valueAt(operating);
  const operatingCashFlow = valueAt(cashFlow);
  const capitalExpenditure = valueAt(capex);
  return {
    ticker,
    companyName: body.entityName ?? ticker,
    fiscalYearEnd: reference.end,
    filedAt: reference.filed ?? reference.end,
    currency: "USD",
    revenue,
    revenueGrowthPercent: growth(revenue, revenues[1]?.val ?? null),
    operatingIncome,
    operatingMarginPercent: revenue && operatingIncome !== null ? (operatingIncome / revenue) * 100 : null,
    netIncome: valueAt(netIncome),
    operatingCashFlow,
    capitalExpenditure,
    freeCashFlow: operatingCashFlow === null || capitalExpenditure === null ? null : operatingCashFlow - Math.abs(capitalExpenditure),
    cash: latestInstant(body, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]),
    longTermDebt: latestInstant(body, ["LongTermDebtAndFinanceLeaseObligations", "LongTermDebtNoncurrent", "LongTermDebt"]),
    sourceUrl: `https://www.sec.gov/edgar/browse/?CIK=${cik}`,
  };
}

async function fetchCompanyFilings(ticker: string, cik: number, userAgent: string): Promise<SecFiling[]> {
  const padded = String(cik).padStart(10, "0");
  const response = await fetchWithTimeout(`https://data.sec.gov/submissions/CIK${padded}.json`, {
    cache: "no-store",
    headers: { "User-Agent": userAgent, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
  }, 30_000, `SEC ${ticker} 공시`);
  const body = await readJsonResponse<SecSubmissions>(response, `SEC ${ticker} 공시`);
  if (!response.ok) throw new Error(response.statusText);
  const recent = body.filings?.recent;
  if (!recent) return [];
  const filings: SecFiling[] = [];
  for (let index = 0; index < (recent.form?.length ?? 0); index += 1) {
    const form = recent.form?.[index] ?? "";
    const accession = recent.accessionNumber?.[index] ?? "";
    const primaryDocument = recent.primaryDocument?.[index] ?? "";
    const filedAt = recent.filingDate?.[index] ?? "";
    if (!FORMS.has(form) || !accession || !primaryDocument || !filedAt) continue;
    const accessionPath = accession.replaceAll("-", "");
    filings.push({
      id: `${ticker}:${accession}`,
      ticker,
      companyName: body.name ?? ticker,
      form,
      filedAt,
      reportDate: recent.reportDate?.[index] || undefined,
      primaryDocument,
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/${primaryDocument}`,
      importance: importance(form),
    });
    if (filings.length >= 12) break;
  }
  return filings;
}

export async function collectSecFilings(tickers: string[], userAgent: string) {
  const response = await fetchWithTimeout("https://www.sec.gov/files/company_tickers.json", {
    cache: "no-store",
    headers: { "User-Agent": userAgent, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
  }, 30_000, "SEC 티커 목록");
  const tickerMapBody = await readJsonResponse<SecTickerMap>(response, "SEC 티커 목록");
  if (!response.ok) throw new Error(response.statusText);
  const byTicker = new Map(Object.values(tickerMapBody).flatMap((row) => row.ticker && Number.isFinite(row.cik_str)
    ? [[row.ticker.toUpperCase(), { cik: row.cik_str!, name: row.title ?? row.ticker }]]
    : []));
  const normalized = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))].slice(0, 20);
  const filings: SecFiling[] = [];
  const fundamentals: CompanyFundamentalSnapshot[] = [];
  const warnings: string[] = [];
  let requestCount = 1;

  for (let index = 0; index < normalized.length; index += 3) {
    const batch = normalized.slice(index, index + 3);
    const settled = await Promise.allSettled(batch.map(async (ticker) => {
      const company = byTicker.get(ticker);
      if (!company) throw new Error("SEC CIK를 찾지 못했습니다.");
      const [filingsResult, fundamentalsResult] = await Promise.allSettled([
        fetchCompanyFilings(ticker, company.cik, userAgent),
        fetchCompanyFundamentals(ticker, company.cik, userAgent),
      ]);
      return {
        filings: filingsResult.status === "fulfilled" ? filingsResult.value : [],
        fundamentals: fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : null,
        warnings: [
          ...(filingsResult.status === "rejected"
            ? [`${ticker} 공시: ${filingsResult.reason instanceof Error ? filingsResult.reason.message : String(filingsResult.reason)}`]
            : []),
          ...(fundamentalsResult.status === "rejected"
            ? [`${ticker} 재무: ${fundamentalsResult.reason instanceof Error ? fundamentalsResult.reason.message : String(fundamentalsResult.reason)}`]
            : []),
        ],
      };
    }));
    requestCount += batch.length * 2;
    settled.forEach((result, itemIndex) => {
      if (result.status === "fulfilled") {
        filings.push(...result.value.filings);
        if (result.value.fundamentals) fundamentals.push(result.value.fundamentals);
        warnings.push(...result.value.warnings);
      }
      else warnings.push(`${batch[itemIndex]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    });
    if (index + 3 < normalized.length) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  return {
    filings: filings.sort((left, right) => right.filedAt.localeCompare(left.filedAt)).slice(0, 80),
    fundamentals,
    warnings,
    requestCount,
  };
}
