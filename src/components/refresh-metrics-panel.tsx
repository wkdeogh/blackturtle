import type { RefreshMetricsRecord } from "@/lib/types";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function scalarEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    if (typeof raw === "number") return [[key, raw.toLocaleString("ko-KR")]];
    if (typeof raw === "boolean") return [[key, raw ? "예" : "아니오"]];
    if (typeof raw === "string" && raw.length < 80) return [[key, raw]];
    return [];
  });
}

export function RefreshMetricsPanel({ records, migrationReady }: { records: RefreshMetricsRecord[]; migrationReady: boolean }) {
  if (!migrationReady || !records.length) return null;
  return <details className="refresh-metrics-panel"><summary><div><p className="kicker">REFRESH OBSERVABILITY</p><strong>최근 갱신 사용량·품질</strong><small>API 호출 수, 저장 건수, 경고를 실행별로 확인</small></div><span>펼쳐보기</span></summary><div className="refresh-metrics-runs">{records.map((record) => <article key={record.refreshRunId}><header><div><b>{record.source === "all" ? "전체" : record.source === "macro" ? "매크로" : record.source === "market" ? "시장지수" : "X 모니터링"}</b><time dateTime={record.startedAt}>{record.startedAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(record.startedAt)) : "시간 없음"}</time></div><span>{Object.keys(record.metrics).length}개 단계</span></header><div>{Object.entries(record.metrics).map(([component, raw]) => <section key={component}><strong>{label(component)}</strong><dl>{scalarEntries(raw).slice(0, 10).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>)}</dl></section>)}</div></article>)}</div></details>;
}
