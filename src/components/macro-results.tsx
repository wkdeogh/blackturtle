import { FearGreedCard } from "@/components/fear-greed-card";
import { MacroCard } from "@/components/macro-card";
import type { MacroSeries } from "@/lib/types";

const PRIORITY = new Map([["VIXCLS", 0], ["T10Y2Y", 1], ["DCOILWTICO", 2]]);

export function MacroResults({ series }: { series: MacroSeries[] }) {
  const fearGreed = series.find((item) => item.id === "CNN_FEAR_GREED");
  const economicSeries = series
    .filter((item) => item.id !== "CNN_FEAR_GREED")
    .sort((left, right) => (PRIORITY.get(left.id) ?? 10) - (PRIORITY.get(right.id) ?? 10));

  return (
    <section className="section-block macro-section">
      <div className="section-title"><div><p className="kicker">01 · MACRO INDICATORS</p><h2>시장 심리와 경제 지표</h2></div><p>상태는 지표별 규칙으로 계산한 참고값입니다.</p></div>
      {fearGreed ? <FearGreedCard series={fearGreed} /> : null}
      <div className="macro-grid">{economicSeries.map((item) => <MacroCard series={item} key={item.id} />)}</div>
    </section>
  );
}
