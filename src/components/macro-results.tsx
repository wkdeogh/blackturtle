"use client";

import { useMemo, useState } from "react";
import { FearGreedCard } from "@/components/fear-greed-card";
import { MacroCard } from "@/components/macro-card";
import type { MacroSeries } from "@/lib/types";

const PRIORITY = new Map([["VIXCLS", 0], ["T10Y2Y", 1], ["DCOILWTICO", 2], ["WTI_FUTURES_FRONT", 3]]);
const CORE_IDS = new Set(["VIXCLS", "T10Y2Y", "DCOILWTICO", "WTI_FUTURES_FRONT", "PCEPILFE", "ICSA", "NFCI", "BAMLH0A0HYM2"]);

export function MacroResults({ series, warnings = [] }: { series: MacroSeries[]; warnings?: string[] }) {
  const [group, setGroup] = useState("핵심");
  const fearGreed = series.find((item) => item.id === "CNN_FEAR_GREED");
  const economicSeries = series
    .filter((item) => item.id !== "CNN_FEAR_GREED")
    .sort((left, right) => (PRIORITY.get(left.id) ?? 10) - (PRIORITY.get(right.id) ?? 10));
  const groups = useMemo(() => ["핵심", "전체", ...new Set(economicSeries.map((item) => item.group))], [economicSeries]);
  const visible = group === "전체" ? economicSeries : group === "핵심" ? economicSeries.filter((item) => CORE_IDS.has(item.id)) : economicSeries.filter((item) => item.group === group);

  return (
    <section className="section-block macro-section">
      <div className="section-title"><div><p className="kicker">01 · MACRO INDICATORS</p><h2>시장 심리와 경제 지표</h2></div><p>상태는 지표별 규칙으로 계산한 참고값입니다.</p></div>
      {warnings.length ? <aside className="market-warning" role="status"><strong>일부 지표는 이번 갱신에서 새로 받지 못했습니다.</strong>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</aside> : null}
      {fearGreed ? <FearGreedCard series={fearGreed} /> : null}
      <div className="macro-group-tabs" role="tablist" aria-label="매크로 지표 그룹">{groups.map((item) => <button type="button" role="tab" aria-selected={group === item} className={group === item ? "active" : ""} onClick={() => setGroup(item)} key={item}>{item}<small>{item === "전체" ? economicSeries.length : item === "핵심" ? economicSeries.filter((seriesItem) => CORE_IDS.has(seriesItem.id)).length : economicSeries.filter((seriesItem) => seriesItem.group === item).length}</small></button>)}</div>
      <div className="macro-grid stagger-grid filter-swap" key={group}>{visible.map((item) => <MacroCard series={item} key={item.id} />)}</div>
    </section>
  );
}
