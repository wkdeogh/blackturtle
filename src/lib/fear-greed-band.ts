export function fearGreedBand(value: number) {
  if (value < 25) return { key: "extreme-fear", label: "극단적 공포", summary: "불안과 위험회피가 매우 강한 구간입니다." };
  if (value < 45) return { key: "fear", label: "공포", summary: "투자자 불안이 우세한 구간입니다." };
  if (value < 55) return { key: "neutral", label: "중립", summary: "공포와 탐욕 어느 한쪽으로 크게 기울지 않은 구간입니다." };
  if (value < 75) return { key: "greed", label: "탐욕", summary: "위험선호와 낙관이 우세한 구간입니다." };
  return { key: "extreme-greed", label: "극단적 탐욕", summary: "과도한 낙관과 추격 매수를 경계할 구간입니다." };
}
