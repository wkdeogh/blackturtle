"use client";

import { useEffect, useState } from "react";
import type { RefreshRunStatus } from "@/lib/types";

export function GlobalRefreshIndicator() {
  const [run, setRun] = useState<RefreshRunStatus | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function check() {
      try {
        const response = await fetch("/api/refresh", { method: "GET", cache: "no-store" });
        const body = (await response.json()) as { run?: RefreshRunStatus | null };
        if (!active || !response.ok) return;
        const next = body.run ?? null;
        setRun(next);
        if (next?.status === "running") timer = window.setTimeout(check, 3_000);
      } catch {
        // Page controls surface status errors; the compact global badge stays quiet.
      }
    }
    void check();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (run?.status !== "running") return null;
  return <span className="global-refresh-status"><i aria-hidden="true" />{run.source === "macro" ? "매크로" : run.source === "market" ? "시장" : run.source === "social" ? "X" : "데이터"} 갱신 중</span>;
}
