import type { DataSourceStatus } from "@/lib/types";

const STATE_LABEL: Record<DataSourceStatus["state"], string> = {
  fresh: "최신",
  stale: "이전 값 유지",
  error: "오류",
  not_configured: "설정 필요",
};

export function DataSourceStatusList({ statuses, title = "데이터 상태" }: { statuses: DataSourceStatus[]; title?: string }) {
  if (!statuses.length) return null;
  return (
    <section className="source-status-card" aria-label={title}>
      <header><div><p className="kicker">SOURCE HEALTH</p><h2>{title}</h2></div><span>{statuses.filter((item) => item.state === "fresh").length}/{statuses.length} 최신</span></header>
      <div className="source-status-grid">
        {statuses.map((status) => (
          <article className={`source-status ${status.state}`} key={status.source}>
            <div><i aria-hidden="true" /><strong>{status.label}</strong><span>{STATE_LABEL[status.state]}</span></div>
            <p>{status.observationDate ? `기준 ${status.observationDate}` : status.updatedAt ? `저장 ${status.updatedAt.slice(0, 10)}` : "저장 데이터 없음"}</p>
            {status.message ? <small>{status.message}</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
