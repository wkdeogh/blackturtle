"use client";

import { useMemo, useState } from "react";
import { FearGreedCard } from "@/components/fear-greed-card";
import { MacroCard } from "@/components/macro-card";
import type { MacroSeries } from "@/lib/types";

const PRIORITY = new Map([["VIXCLS", 0], ["DGS2", 1], ["DGS10", 2], ["T10Y2Y", 3], ["DCOILWTICO", 4], ["WTI_FUTURES_FRONT", 5]]);
const CORE_IDS = new Set(["VIXCLS", "DGS2", "DGS10", "T10Y2Y", "DCOILWTICO", "WTI_FUTURES_FRONT", "PCEPILFE", "ICSA", "NFCI", "BAMLH0A0HYM2"]);

export function MacroResults({ series, warnings = [] }: { series: MacroSeries[]; warnings?: string[] }) {
  const [group, setGroup] = useState("핵심");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const fearGreed = series.find((item) => item.id === "CNN_FEAR_GREED");
  const economicSeries = series
    .filter((item) => item.id !== "CNN_FEAR_GREED")
    .sort((left, right) => (PRIORITY.get(left.id) ?? 10) - (PRIORITY.get(right.id) ?? 10));
  const groups = useMemo(() => ["핵심", "전체", ...new Set(economicSeries.map((item) => item.group))], [economicSeries]);
  const grouped = group === "전체" ? economicSeries : group === "핵심" ? economicSeries.filter((item) => CORE_IDS.has(item.id)) : economicSeries.filter((item) => item.group === group);

  const visible = term ? economicSeries.filter((item) => `${item.label} ${item.id} ${item.group}`.toLowerCase().includes(term)) : grouped;

  return (
    <section className="section-block macro-section">
      <div className="section-title"><div><p className="kicker">01 · MACRO INDICATORS</p><h2>시장 심리와 경제 지표</h2></div><p>상태는 지표별 규칙으로 계산한 참고값입니다.</p></div>
      {warnings.length ? <aside className="market-warning" role="status"><strong>일부 지표는 이번 갱신에서 새로 받지 못했습니다.</strong>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</aside> : null}
      {fearGreed ? <FearGreedCard series={fearGreed} /> : null}
      <div className="investor-toolbar"><label className="investor-search"><span className="sr-only">전체 매크로 지표 검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="전체 지표 검색 · 금리, CPI, 고용" /></label>{term ? <><span className="investor-help" role="status">전체 지표에서 {visible.length}개 검색됨</span><button type="button" className="secondary-button" onClick={() => setQuery("")}>검색 지우기</button></> : null}</div>
      <div className="macro-group-tabs" role="tablist" aria-label="매크로 지표 그룹">{groups.map((item) => <button type="button" role="tab" aria-selected={!term && group === item} className={!term && group === item ? "active" : ""} onClick={() => { setGroup(item); setQuery(""); }} key={item}>{item}<small>{item === "전체" ? economicSeries.length : item === "핵심" ? economicSeries.filter((seriesItem) => CORE_IDS.has(seriesItem.id)).length : economicSeries.filter((seriesItem) => seriesItem.group === item).length}</small></button>)}</div>
      {!visible.length ? <p className="inline-empty">일치하는 지표가 없습니다. 지표 이름이나 FRED 코드로 검색해보세요.</p> : null}
      <div className="macro-grid stagger-grid filter-swap" key={group}>{visible.map((item) => <MacroCard series={item} key={item.id} />)}</div>
    </section>
  );
}
