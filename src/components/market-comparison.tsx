"use client";

import { useMemo, useState } from "react";
import { rangePerformance } from "@/lib/investor-view";
import { marketDrawdownForRange, type MarketChartRange } from "@/lib/market-chart-range";
import type { MarketSeries } from "@/lib/types";

function signed(value: number | null) {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function MarketComparison({ series }: { series: MarketSeries[] }) {
  const [range, setRange] = useState<MarketChartRange>("1Y");
  const [sort, setSort] = useState("default");
  const rows = useMemo(() => {
    const values = series.map((item) => ({ item, performance: rangePerformance(item.points, range), drawdown: marketDrawdownForRange(item.points, range) }));
    if (sort !== "default") values.sort((a, b) => {
      const left = sort === "return" ? a.performance?.percent : a.drawdown?.drawdownPercent;
      const right = sort === "return" ? b.performance?.percent : b.drawdown?.drawdownPercent;
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      return sort === "return" ? right - left : left - right;
    });
    return values;
  }, [series, range, sort]);

  return <section className="section-block market-comparison" aria-labelledby="market-comparison-title">
    <div className="section-title"><div><p className="kicker">MARKET AT A GLANCE</p><h2 id="market-comparison-title">주요 자산 한눈에</h2></div><p>자산을 누르면 상세 차트로 이동합니다.</p></div>
    <div className="investor-toolbar">
      <div className="investor-segments" role="group" aria-label="비교 기간">{(["6M", "1Y", "3Y"] as const).map((value) => <button type="button" aria-pressed={range === value} onClick={() => setRange(value)} key={value}>{value}</button>)}</div>
      <label className="investor-select">정렬<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">기본 순서</option><option value="return">기간 상승률순</option><option value="drawdown">고점 대비 낙폭순</option></select></label>
    </div>
    <div className="comparison-scroll" role="region" aria-label="주요 자산 비교표" tabIndex={0}>
      <table className="comparison-table"><thead><tr><th scope="col">자산 / 기준일</th><th scope="col">기간 등락</th><th scope="col">기간 고점 대비</th><th scope="col">계산 구간</th></tr></thead>
        <tbody>{rows.map(({ item, performance, drawdown }) => <tr key={item.id}>
          <th scope="row"><a href={`#market-${item.id}`}>{item.label} <span aria-hidden="true">↗</span></a><small>{item.symbol} · {item.observationDate}</small></th>
          <td className={performance ? performance.percent >= 0 ? "up" : "down" : ""}>{signed(performance?.percent ?? null)}</td>
          <td className={drawdown && drawdown.drawdownPercent < -10 ? "down" : ""}>{signed(drawdown?.drawdownPercent ?? null)}</td>
          <td><small>{performance ? `${performance.start} ~ ${performance.end}` : "데이터 부족"}</small></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="investor-help">저장된 각 자산의 마지막 관측일 기준 · 배당·환율 환산 미반영 · 일간/주간 자료와 보유 이력에 따라 실제 계산 구간이 다릅니다.</p>
  </section>;
}
