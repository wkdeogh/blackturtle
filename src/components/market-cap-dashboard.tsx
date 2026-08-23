"use client";

import { useMemo, useState } from "react";
import type { MarketCapitalizationItem, MarketCapitalizationSnapshot } from "@/lib/types";

function compactDollar(value: number): string {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 1 : 2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(value >= 100_000_000_000 ? 0 : 1)}B`;
  return `$${(value / 1_000_000).toFixed(0)}M`;
}

function fullDollar(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function percent(value: number | null): string {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function rankMovement(item: MarketCapitalizationItem) {
  if (item.previousRank === null) return <span className="rank-move new">NEW</span>;
  if (!item.rankChange) return <span className="rank-move flat">—</span>;
  return <span className={`rank-move ${item.rankChange > 0 ? "up" : "down"}`}>{item.rankChange > 0 ? "▲" : "▼"}{Math.abs(item.rankChange)}</span>;
}

export function MarketCapDashboard({ snapshot }: { snapshot: MarketCapitalizationSnapshot }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [visibleCount, setVisibleCount] = useState(50);
  const ranked = snapshot.items.slice(0, 200);
  const sectors = useMemo(() => [...new Set(snapshot.items.map((item) => item.sector))].sort((a, b) => a.localeCompare(b, "ko")), [snapshot.items]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => ranked.filter((item) => {
    const matchesQuery = !normalizedQuery || item.symbol.toLowerCase().includes(normalizedQuery) || item.name.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (sector === "all" || item.sector === sector);
  }), [normalizedQuery, ranked, sector]);
  const rows = filtered.slice(0, normalizedQuery || sector !== "all" ? filtered.length : visibleCount);
  const totalMarketCap = ranked.reduce((sum, item) => sum + item.marketCap, 0);
  const topTenMarketCap = ranked.slice(0, 10).reduce((sum, item) => sum + item.marketCap, 0);
  const sectorTotals = (() => {
    const totals = new Map<string, number>();
    for (const item of ranked) totals.set(item.sector, (totals.get(item.sector) ?? 0) + item.marketCap);
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  })();
  const largest = sectorTotals[0];
  const maximum = ranked[0]?.marketCap ?? 1;

  return <>
    <section className="market-cap-summary" aria-label="시가총액 상위 200개 요약">
      <article><span>TOP 200 합산</span><strong>{compactDollar(totalMarketCap)}</strong><small>중복 주식 종류는 기업 단위로 정리</small></article>
      <article><span>상위 10 집중도</span><strong>{totalMarketCap ? `${((topTenMarketCap / totalMarketCap) * 100).toFixed(1)}%` : "-"}</strong><small>TOP 200 합산 시총 중 비중</small></article>
      <article><span>최대 섹터</span><strong>{largest?.[0] ?? "-"}</strong><small>{largest && totalMarketCap ? `${((largest[1] / totalMarketCap) * 100).toFixed(1)}%` : "분류 데이터 없음"}</small></article>
    </section>

    <section className="market-cap-board">
      <header className="market-cap-tools">
        <label className="market-cap-search"><span className="sr-only">종목 검색</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }} placeholder="티커 또는 기업명 검색" autoComplete="off" /><i aria-hidden="true">⌕</i></label>
        <label className="market-cap-sector"><span className="sr-only">섹터 선택</span><select value={sector} onChange={(event) => { setSector(event.target.value); setVisibleCount(50); }}><option value="all">전체 섹터</option>{sectors.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      </header>

      <div className="market-cap-table-head" aria-hidden="true"><span>순위</span><span>기업</span><span>섹터</span><span>주가 / 일간</span><span>시가총액</span></div>
      {rows.length ? <ol className="market-cap-list">{rows.map((item) => <li key={item.symbol}>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${item.rank}위 ${item.name} Nasdaq에서 보기`}>
          <div className="market-cap-rank"><strong>{item.rank}</strong>{rankMovement(item)}</div>
          <div className="market-cap-company"><strong>{item.symbol}</strong><span>{item.name}</span><small>{item.industry || item.country || "산업 분류 없음"}</small></div>
          <span className="market-cap-sector-name">{item.sector}</span>
          <div className="market-cap-price"><strong>{item.lastPrice === null ? "-" : `$${item.lastPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}`}</strong><span className={(item.dayChangePercent ?? 0) > 0 ? "up" : (item.dayChangePercent ?? 0) < 0 ? "down" : "flat"}>{percent(item.dayChangePercent)}</span></div>
          <div className="market-cap-value"><strong title={fullDollar(item.marketCap)}>{compactDollar(item.marketCap)}</strong><span className={(item.marketCapChangePercent ?? 0) > 0 ? "up" : (item.marketCapChangePercent ?? 0) < 0 ? "down" : "flat"}>{item.marketCapChangePercent === null ? "첫 저장" : `이전 갱신 ${percent(item.marketCapChangePercent)}`}</span><i style={{ width: `${Math.max(5, (item.marketCap / maximum) * 100)}%` }} /></div>
          <b className="market-cap-link" aria-hidden="true">↗</b>
        </a>
      </li>)}</ol> : <div className="inline-empty">검색 조건에 맞는 기업이 없습니다.</div>}
      {rows.length < filtered.length ? <div className="market-cap-more"><span>{rows.length}/{filtered.length}개 표시</span><button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 50, filtered.length))}>50개 더 보기</button></div> : null}
    </section>

    <p className="market-cap-source-note">시가총액은 Nasdaq Screener의 최근 주가와 발행주식수 기반 값입니다. 장중 가격, 자사주 매입, 증자, 주식 종류 처리에 따라 다른 서비스의 순위와 차이가 날 수 있습니다.</p>
  </>;
}
