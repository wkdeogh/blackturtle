"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RefreshRunStatus, RefreshSource } from "@/lib/types";
import { useRefreshJob } from "@/components/use-refresh-job";

export function RefreshButton({ source, initialRun, compact = false }: { source: RefreshSource; initialRun: RefreshRunStatus | null; compact?: boolean }) {
  const refresh = useRefreshJob(source, initialRun);

  return (
    <div className={compact ? "action-wrap compact" : "action-wrap"}>
      <button className="primary-button refresh-button" type="button" onClick={() => void refresh.startRefresh()} disabled={refresh.busy}>
        <span className={refresh.busy ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
        {refresh.starting ? "요청 중" : refresh.running ? (refresh.ownRun ? "갱신 중" : "다른 갱신 중") : "데이터 갱신"}
      </button>
      {refresh.message ? <p className={refresh.isError ? "action-message error" : "action-message"} role="status">{refresh.message}</p> : null}
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return <button className="text-button" type="button" onClick={logout} disabled={loading}>{loading ? "…" : "잠금"}</button>;
}
