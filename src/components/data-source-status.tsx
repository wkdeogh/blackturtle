import type { DataSourceStatus } from "@/lib/types";

const STATE_LABEL: Record<DataSourceStatus["state"], string> = {
  fresh: "최신",
  stale: "이전 값 유지",
  error: "오류",
  not_configured: "설정 필요",
};

export function DataSourceStatusList({ statuses, title = "데이터 상태" }: { statuses: DataSourceStatus[]; title?: string }) {
  if (!statuses.length) return null;
  const attention = statuses.filter((item) => item.state !== "fresh").length;
  return (
    <details className="source-status-card" aria-label={title} open={attention > 0}>
      <summary><div><span className="kicker">SOURCE HEALTH</span><strong>{title}</strong></div><span className={attention ? "source-attention" : "source-healthy"}>{attention ? `${attention}개 확인 필요` : `${statuses.length}개 모두 최신`}<span className="source-disclosure" aria-hidden="true">⌄</span></span></summary>
      <div className="source-status-grid">
        {statuses.map((status) => (
          <article className={`source-status ${status.state}`} key={status.source}>
            <div><i aria-hidden="true" /><strong>{status.label}</strong><span>{STATE_LABEL[status.state]}</span></div>
            <p>{status.observationDate ? `기준 ${status.observationDate}` : status.updatedAt ? `저장 ${status.updatedAt.slice(0, 10)}` : "저장 데이터 없음"}</p>
            {status.message ? <small>{status.message}</small> : null}
          </article>
        ))}
      </div>
    </details>
  );
}
