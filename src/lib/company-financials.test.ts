import { describe, expect, it } from "vitest";
import { parseCompanyFinancialFacts } from "@/lib/company-financials";

describe("parseCompanyFinancialFacts", () => {
  it("SEC Company Facts에서 연간·분기 매출과 영업이익을 같은 기간으로 맞춘다", () => {
    const result = parseCompanyFinancialFacts({
      entityName: "Example Corp",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
            { start: "2025-01-01", end: "2025-12-31", val: 120_000, accn: "0001", form: "10-K", filed: "2026-02-10" },
            { start: "2024-01-01", end: "2024-12-31", val: 100_000, accn: "0002", form: "10-K", filed: "2025-02-10" },
            { start: "2025-07-01", end: "2025-09-30", val: 32_000, accn: "0003", form: "10-Q", filed: "2025-11-01" },
          ] } },
          OperatingIncomeLoss: { units: { USD: [
            { start: "2025-01-01", end: "2025-12-31", val: 24_000, accn: "0001", form: "10-K", filed: "2026-02-10" },
            { start: "2024-01-01", end: "2024-12-31", val: 15_000, accn: "0002", form: "10-K", filed: "2025-02-10" },
            { start: "2025-07-01", end: "2025-09-30", val: 8_000, accn: "0003", form: "10-Q", filed: "2025-11-01" },
          ] } },
        },
      },
    });

    expect(result.companyName).toBe("Example Corp");
    expect(result.financial?.currency).toBe("USD");
    expect(result.financial?.annual).toHaveLength(2);
    expect(result.financial?.annual[0]).toMatchObject({ revenue: 120_000, operatingIncome: 24_000, operatingMarginPercent: 20 });
    expect(result.financial?.quarterly[0]).toMatchObject({ periodEnd: "2025-09-30", revenue: 32_000, operatingIncome: 8_000, operatingMarginPercent: 25 });
    expect(result.latest?.accession).toBe("0001");
  });

  it("USD가 없으면 공시에서 가장 많이 사용한 통화를 유지한다", () => {
    const result = parseCompanyFinancialFacts({
      entityName: "Foreign Issuer",
      facts: { "ifrs-full": { Revenue: { units: { EUR: [
        { start: "2025-01-01", end: "2025-12-31", val: 50_000, accn: "1001", form: "20-F", filed: "2026-03-01" },
      ] } } } },
    });
    expect(result.financial?.currency).toBe("EUR");
    expect(result.financial?.annual[0].revenue).toBe(50_000);
  });
});
