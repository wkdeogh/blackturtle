import { MarketChart } from "@/components/market-chart";
import type { MarketRegime } from "@/lib/market-regime";

function signed(value: number | null, suffix = "%") {
  return value === null ? "-" : `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

export function RegimeDashboard({ regime }: { regime: MarketRegime }) {
  const marker = Math.max(0, Math.min(100, (regime.score + 100) / 2));
  return (
    <>
      <section className="regime-overview">
        <div className="regime-score-card">
          <p className="kicker">COMPOSITE REGIME</p>
          <div className="regime-score-row"><strong>{regime.score > 0 ? "+" : ""}{regime.score}</strong><div><h2>{regime.label}</h2><p>{regime.summary}</p></div></div>
          <div className="regime-scale" aria-label={`시장 레짐 점수 ${regime.score}점`}><i className="caution" /><i className="neutral" /><i className="favorable" /><b style={{ left: `${marker}%` }} /></div>
          <div className="regime-scale-label"><span>방어</span><span>중립</span><span>위험선호</span></div>
        </div>
        {regime.netLiquidity ? <aside className="liquidity-card"><p className="kicker">NET LIQUIDITY PROXY</p><strong>{new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(regime.netLiquidity.currentBillions)}B</strong><b className={(regime.netLiquidity.change13WeeksPercent ?? 0) >= 0 ? "up" : "down"}>13주 {signed(regime.netLiquidity.change13WeeksPercent)}</b><p>{regime.netLiquidity.note}</p></aside> : null}
      </section>

      <section className="section-block">
        <div className="section-title"><div><p className="kicker">FOUR AXES</p><h2>레짐을 구성하는 네 축</h2></div><p>점수보다 구성요소의 방향을 함께 확인하세요.</p></div>
        <div className="regime-axis-grid stagger-grid">
          {regime.axes.map((axis) => <article className={`regime-axis-card ${axis.state}`} key={axis.id}>
            <header><div><span>{axis.state === "favorable" ? "양호" : axis.state === "caution" ? "주의" : "중립"}</span><h3>{axis.label}</h3></div><strong>{axis.score > 0 ? "+" : ""}{axis.score}</strong></header>
            <p>{axis.summary}</p>
            <dl>{axis.components.map((item) => <div key={item.label}><dt>{item.label}<small>{item.detail}</small></dt><dd className={item.score >= 25 ? "up" : item.score <= -25 ? "down" : ""}>{item.value}</dd></div>)}</dl>
          </article>)}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title"><div><p className="kicker">MARKET INTERNALS</p><h2>시장 내부 상대강도</h2></div><p>절대 가격이 아니라 두 자산의 비율 추세입니다.</p></div>
        {!regime.relatives.length ? <div className="inline-empty">시장 내부 신호는 다음 시장지수 갱신 후 표시됩니다.</div> : <div className="relative-grid stagger-grid">
          {regime.relatives.map((signal) => <article className="relative-card" key={signal.id}>
            <header><div><span className={`state-pill ${signal.state}`}>{signal.state === "leading" ? "우위" : signal.state === "lagging" ? "열위" : "중립"}</span><h3>{signal.label}</h3></div><b>{signal.numerator}/{signal.denominator}</b></header>
            <div className="relative-stats"><span>1개월 <b className={(signal.oneMonth ?? 0) >= 0 ? "up" : "down"}>{signed(signal.oneMonth)}</b></span><span>3개월 <b className={(signal.threeMonths ?? 0) >= 0 ? "up" : "down"}>{signed(signal.threeMonths)}</b></span><span>6개월 <b className={(signal.sixMonths ?? 0) >= 0 ? "up" : "down"}>{signed(signal.sixMonths)}</b></span></div>
            <MarketChart points={signal.points} decimals={3} tone={signal.state === "lagging" ? "amber" : "green"} />
            <p>{signal.meaning}</p>
          </article>)}
        </div>}
      </section>
    </>
  );
}
