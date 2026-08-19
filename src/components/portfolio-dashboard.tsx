"use client";

import { useMemo, useState } from "react";
import { MarketChart } from "@/components/market-chart";
import { showToast } from "@/lib/toast";
import type { MarketResearchPayload, PortfolioItem } from "@/lib/types";

type Draft = Omit<PortfolioItem, "id" | "createdAt" | "updatedAt"> & { id?: string };

const EMPTY_DRAFT: Draft = {
  ticker: "", companyName: "", kind: "watchlist", quantity: 0, averageCost: null, targetWeight: null,
  sector: "", currency: "USD", thesis: "", invalidation: "", notes: "", enabled: true, position: 0,
};

function numberOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency, maximumFractionDigits: currency === "KRW" ? 0 : 2 }).format(value);
}

export function PortfolioDashboard({ initialItems, research, migrationReady }: { initialItems: PortfolioItem[]; research: MarketResearchPayload; migrationReady: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const prices = useMemo(() => new Map(research.portfolioPrices.map((price) => [price.ticker, price])), [research.portfolioPrices]);
  const fundamentals = useMemo(() => new Map((research.fundamentals ?? []).map((item) => [item.ticker, item])), [research.fundamentals]);
  const holdings = items.filter((item) => item.kind === "holding");
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const item of holdings) {
      const price = prices.get(item.ticker);
      if (!price) continue;
      byCurrency.set(item.currency, (byCurrency.get(item.currency) ?? 0) + item.quantity * price.current);
    }
    return byCurrency;
  }, [holdings, prices]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const payload: Draft = {
      ...editing,
      ticker: String(form.get("ticker") ?? ""),
      companyName: String(form.get("companyName") ?? ""),
      kind: form.get("kind") === "holding" ? "holding" : "watchlist",
      quantity: numberOrNull(form.get("quantity")) ?? 0,
      averageCost: numberOrNull(form.get("averageCost")),
      targetWeight: numberOrNull(form.get("targetWeight")),
      sector: String(form.get("sector") ?? ""),
      currency: form.get("currency") === "KRW" ? "KRW" : "USD",
      thesis: String(form.get("thesis") ?? ""),
      invalidation: String(form.get("invalidation") ?? ""),
      notes: String(form.get("notes") ?? ""),
      enabled: form.get("enabled") === "on",
    };
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "저장하지 못했습니다.");
      setItems(body.items ?? []);
      setEditing(null);
      showToast(`${payload.ticker.toUpperCase()} 저장 완료`);
    } catch (error) { showToast(error instanceof Error ? error.message : "저장하지 못했습니다.", "error"); }
    finally { setSaving(false); }
  }

  async function remove(item: PortfolioItem) {
    if (!window.confirm(`${item.ticker}를 삭제할까요?`)) return;
    const previous = items;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try {
      const response = await fetch("/api/portfolio", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "삭제하지 못했습니다.");
      setItems(body.items ?? []);
      showToast(`${item.ticker} 삭제 완료`);
    } catch (error) { setItems(previous); showToast(error instanceof Error ? error.message : "삭제하지 못했습니다.", "error"); }
  }

  if (!migrationReady) return <aside className="setup-alert"><div><span className="alert-dot" /><strong>포트폴리오 migration이 필요합니다</strong></div><p><code>202608190014_investor_research.sql</code>을 Supabase SQL Editor에서 실행하세요.</p></aside>;

  return <>
    <section className="portfolio-summary-grid">
      {[...totals.entries()].map(([currency, total]) => <article key={currency}><span>보유종목 평가액 · {currency}</span><strong>{formatMoney(total, currency)}</strong><small>통화별 합계 · 환율 환산 전</small></article>)}
      <article><span>등록 종목</span><strong>{items.length}</strong><small>보유 {holdings.length} · 관심 {items.length - holdings.length}</small></article>
      <article><span>가격 확인</span><strong>{items.filter((item) => prices.has(item.ticker)).length}/{items.length}</strong><small>시장지수 갱신 시 함께 업데이트</small></article>
      <button className="portfolio-add-card" type="button" onClick={() => setEditing(EMPTY_DRAFT)}><b>＋</b><span>종목 추가</span><small>최대 50개</small></button>
    </section>

    {!items.length ? <section className="inline-empty portfolio-empty"><strong>아직 등록한 종목이 없습니다.</strong><p>보유종목은 수량과 평균단가를, 관심종목은 투자 근거와 무효화 조건을 기록해보세요.</p><button className="primary-button" type="button" onClick={() => setEditing(EMPTY_DRAFT)}>첫 종목 추가</button></section> : <section className="portfolio-list">
      {items.map((item) => {
        const price = prices.get(item.ticker);
        const fundamental = fundamentals.get(item.ticker);
        const value = price && item.kind === "holding" ? price.current * item.quantity : null;
        const pnl = price && item.averageCost && item.averageCost > 0 ? ((price.current / item.averageCost) - 1) * 100 : null;
        const currencyTotal = totals.get(item.currency) ?? 0;
        const weight = value !== null && currencyTotal > 0 ? (value / currencyTotal) * 100 : null;
        const drift = weight !== null && item.targetWeight !== null ? weight - item.targetWeight : null;
        return <article className={`portfolio-item ${item.enabled ? "" : "disabled"}`} key={item.id}>
          <header><div><span className="data-tag">{item.kind === "holding" ? "보유" : "관심"}{item.sector ? ` · ${item.sector}` : ""}</span><h2>{item.ticker}<small>{item.companyName}</small></h2></div><div className="portfolio-item-actions"><button type="button" onClick={() => setEditing(item)}>수정</button><button type="button" onClick={() => remove(item)}>삭제</button></div></header>
          <div className="portfolio-metrics">
            <div><span>현재가</span><strong>{price ? formatMoney(price.current, item.currency) : "가격 없음"}</strong><small>{price?.observationDate ?? "다음 시장 갱신 필요"}</small></div>
            {item.kind === "holding" ? <><div><span>평가액</span><strong>{value === null ? "-" : formatMoney(value, item.currency)}</strong><small>{item.quantity.toLocaleString("ko-KR")}주</small></div><div><span>평균단가 대비</span><strong className={(pnl ?? 0) >= 0 ? "up" : "down"}>{pnl === null ? "-" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`}</strong><small>{item.averageCost === null ? "평균단가 미입력" : formatMoney(item.averageCost, item.currency)}</small></div><div><span>비중 / 목표</span><strong>{weight === null ? "-" : `${weight.toFixed(1)}%`}</strong><small className={(drift ?? 0) > 3 ? "down" : ""}>{item.targetWeight === null ? "목표 미입력" : `목표 ${item.targetWeight}% · 편차 ${drift === null ? "-" : `${drift > 0 ? "+" : ""}${drift.toFixed(1)}%p`}`}</small></div></> : <><div><span>고점 대비</span><strong className={(price?.drawdownPercent ?? 0) < -10 ? "down" : ""}>{price ? `${price.drawdownPercent.toFixed(2)}%` : "-"}</strong><small>{price ? `${price.peakDate} 고점` : "-"}</small></div><div><span>목표 비중</span><strong>{item.targetWeight === null ? "-" : `${item.targetWeight}%`}</strong><small>편입 전 계획</small></div></>}
          </div>
          {price?.points.length ? <MarketChart points={price.points} decimals={2} currency={item.currency} tone={pnl !== null && pnl < 0 ? "amber" : "green"} /> : null}
          {fundamental ? <div className="fundamental-strip"><header><div><span>SEC COMPANY FACTS</span><strong>최근 연간 기초체력</strong></div><a href={fundamental.sourceUrl} target="_blank" rel="noreferrer">FY {fundamental.fiscalYearEnd} ↗</a></header><dl><div><dt>매출</dt><dd>{fundamental.revenue === null ? "-" : new Intl.NumberFormat("ko-KR", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(fundamental.revenue)}</dd><small className={(fundamental.revenueGrowthPercent ?? 0) >= 0 ? "up" : "down"}>{fundamental.revenueGrowthPercent === null ? "성장률 -" : `YoY ${fundamental.revenueGrowthPercent > 0 ? "+" : ""}${fundamental.revenueGrowthPercent.toFixed(1)}%`}</small></div><div><dt>영업이익률</dt><dd>{fundamental.operatingMarginPercent === null ? "-" : `${fundamental.operatingMarginPercent.toFixed(1)}%`}</dd><small>연간 보고서</small></div><div><dt>잉여현금흐름</dt><dd>{fundamental.freeCashFlow === null ? "-" : new Intl.NumberFormat("ko-KR", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(fundamental.freeCashFlow)}</dd><small>OCF − CapEx</small></div><div><dt>현금 / 장기부채</dt><dd>{fundamental.cash === null ? "-" : new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(fundamental.cash)} / {fundamental.longTermDebt === null ? "-" : new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(fundamental.longTermDebt)}</dd><small>최근 제출 기준 · USD</small></div></dl></div> : null}
          <div className="portfolio-thesis-grid"><div><span>투자 근거</span><p>{item.thesis || "아직 기록하지 않았습니다."}</p></div><div><span>무효화 조건</span><p>{item.invalidation || "아직 기록하지 않았습니다."}</p></div></div>
        </article>;
      })}
    </section>}

    {editing ? <div className="analysis-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setEditing(null); }}><form className="analysis-modal portfolio-editor" onSubmit={save}>
      <header><div><p className="kicker">INVESTMENT JOURNAL</p><h2>{editing.id ? `${editing.ticker} 수정` : "종목 추가"}</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="닫기">×</button></header>
      <div className="portfolio-form-grid"><label><span>티커 *</span><input name="ticker" defaultValue={editing.ticker} required maxLength={15} autoCapitalize="characters" /></label><label><span>회사명</span><input name="companyName" defaultValue={editing.companyName} maxLength={120} /></label><label><span>분류</span><select name="kind" defaultValue={editing.kind}><option value="watchlist">관심종목</option><option value="holding">보유종목</option></select></label><label><span>통화</span><select name="currency" defaultValue={editing.currency}><option value="USD">USD</option><option value="KRW">KRW</option></select></label><label><span>수량</span><input name="quantity" type="number" min="0" step="any" defaultValue={editing.quantity} /></label><label><span>평균단가</span><input name="averageCost" type="number" min="0" step="any" defaultValue={editing.averageCost ?? ""} /></label><label><span>목표 비중 %</span><input name="targetWeight" type="number" min="0" max="100" step="0.1" defaultValue={editing.targetWeight ?? ""} /></label><label><span>섹터</span><input name="sector" defaultValue={editing.sector} maxLength={80} /></label></div>
      <label className="portfolio-textarea"><span>투자 근거</span><textarea name="thesis" defaultValue={editing.thesis} placeholder="왜 보유하거나 관찰하는지, 확인할 핵심 가설" /></label><label className="portfolio-textarea"><span>무효화 조건</span><textarea name="invalidation" defaultValue={editing.invalidation} placeholder="어떤 사실이 확인되면 가설이 틀렸다고 판단할지" /></label><label className="portfolio-toggle"><input name="enabled" type="checkbox" defaultChecked={editing.enabled} /><span>가격·공시·실적 일정 수집 활성화</span></label>
      <footer className="portfolio-editor-actions"><button className="secondary-button" type="button" onClick={() => setEditing(null)} disabled={saving}>취소</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button></footer>
    </form></div> : null}
  </>;
}
