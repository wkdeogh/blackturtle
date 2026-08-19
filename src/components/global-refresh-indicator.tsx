"use client";

import { useEffect, useRef, useState } from "react";
import { reloadDashboardAfterRefresh } from "@/lib/dashboard-client-cache";
import type { ComprehensiveAnalysisRunStatus, RefreshRunStatus } from "@/lib/types";

export function GlobalRefreshIndicator() {
  const [run, setRun] = useState<RefreshRunStatus | null>(null);
  const [analysisRun, setAnalysisRun] = useState<ComprehensiveAnalysisRunStatus | null>(null);
  const runRef = useRef<RefreshRunStatus | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function check() {
      try {
        const [refreshResponse, analysisResponse] = await Promise.all([
          fetch("/api/refresh", { method: "GET", cache: "no-store" }),
          fetch("/api/comprehensive-analysis", { method: "GET", cache: "no-store" }),
        ]);
        if (!active) return;
        const refreshBody = refreshResponse.ok ? await refreshResponse.json() as { run?: RefreshRunStatus | null } : {};
        const analysisBody = analysisResponse.ok ? await analysisResponse.json() as { run?: ComprehensiveAnalysisRunStatus | null } : {};
        const next = refreshBody.run ?? null;
        const nextAnalysis = analysisBody.run ?? null;
        const previous = runRef.current;
        runRef.current = next;
        setRun(next);
        setAnalysisRun(nextAnalysis);
        if (previous?.status === "running" && previous.id === next?.id && next.status === "success") {
          reloadDashboardAfterRefresh(next.id);
        }
        if (next?.status === "running" || nextAnalysis?.status === "running") timer = window.setTimeout(check, 3_000);
      } catch {
        // Page controls surface status errors; the compact global badge stays quiet.
      }
    }
    function restartPolling() {
      if (timer) window.clearTimeout(timer);
      void check();
    }
    void check();
    window.addEventListener("blackturtle:refresh-started", restartPolling);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("blackturtle:refresh-started", restartPolling);
    };
  }, []);

  if (run?.status === "running") {
    return <span className="global-refresh-status"><i aria-hidden="true" />{run.source === "macro" ? "매크로" : run.source === "market" ? "시장" : run.source === "social" ? "X" : run.source === "all" ? "선택" : "데이터"} 갱신 중</span>;
  }
  if (analysisRun?.status === "running") return <span className="global-refresh-status analysis"><i aria-hidden="true" />종합분석 중</span>;
  return null;
}
