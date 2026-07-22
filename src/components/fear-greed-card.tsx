import { MacroLineChart } from "@/components/macro-line-chart";
import type { MacroSeries } from "@/lib/types";

function fearGreedBand(value: number) {
  if (value < 25) return { key: "extreme-fear", label: "극단적 공포", summary: "불안과 위험회피가 매우 강한 구간입니다." };
  if (value < 45) return { key: "fear", label: "공포", summary: "투자자 불안이 우세한 구간입니다." };
  if (value < 55) return { key: "neutral", label: "중립", summary: "공포와 탐욕 어느 한쪽으로 크게 기울지 않은 구간입니다." };
  if (value < 75) return { key: "greed", label: "탐욕", summary: "위험선호와 낙관이 우세한 구간입니다." };
  return { key: "extreme-greed", label: "극단적 탐욕", summary: "과도한 낙관과 추격 매수를 경계할 구간입니다." };
}

function comparison(series: MacroSeries, offset: number): string {
  const point = series.points.at(-offset);
  return point ? Math.round(point.value).toString() : "—";
}

export function FearGreedCard({ series }: { series: MacroSeries }) {
  const score = Math.max(0, Math.min(100, series.current));
  const band = fearGreedBand(score);
  return (
    <article className="fear-greed-card">
      <div className="fear-greed-current">
        <div className="macro-card-head"><div><span className="data-tag">시장 심리</span><h3>CNN 공포·탐욕 지수</h3></div><a className="source-link" href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noreferrer" aria-label="CNN 공포·탐욕 지수 원문">CNN ↗</a></div>
        <div className={`fear-score ${band.key}`}><strong>{Math.round(score)}</strong><span>{band.label}</span></div>
        <div className="fear-scale" aria-label={`공포·탐욕 점수 100점 중 ${Math.round(score)}점`}>
          <div><span className="extreme-fear" /><span className="fear" /><span className="neutral" /><span className="greed" /><span className="extreme-greed" /></div>
          <i style={{ left: `${score}%` }} />
          <small><span>공포</span><span>중립</span><span>탐욕</span></small>
        </div>
        <div className="fear-comparisons"><span><small>1주 전</small><b>{comparison(series, 6)}</b></span><span><small>1개월 전</small><b>{comparison(series, 22)}</b></span><span><small>1년 전</small><b>{comparison(series, 253)}</b></span></div>
        <p>{band.summary} 단독 매매 신호가 아니라 시장 과열·위축 정도를 확인하는 보조 지표로 사용하세요.</p>
      </div>
      <div className="fear-greed-history">
        <div className="fear-history-head"><div><span>최근 약 1년</span><h3>공포·탐욕 추이</h3></div><time dateTime={series.observationDate}>{series.observationDate}</time></div>
        <MacroLineChart series={series} fixedMin={0} fixedMax={100} tone="sentiment" />
        <p className="fear-source-note">0은 극단적 공포, 100은 극단적 탐욕입니다. CNN 지수를 장 마감 후 갱신되는 공개 데이터로 저장합니다.</p>
      </div>
    </article>
  );
}
