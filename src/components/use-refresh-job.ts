"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RefreshRunStatus, RefreshSource } from "@/lib/types";

interface RefreshResponse {
  run?: RefreshRunStatus | null;
  error?: string;
}

function sourceLabel(source: RefreshSource | null): string {
  return source === "macro" ? "FRED" : source === "social" ? "X" : "데이터";
}

export function useRefreshJob(source: RefreshSource, initialRun: RefreshRunStatus | null) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [starting, setStarting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [completedThisSession, setCompletedThisSession] = useState(false);
  const runRef = useRef(initialRun);

  const applyRun = useCallback((next: RefreshRunStatus | null) => {
    const previous = runRef.current;
    runRef.current = next;
    setRun(next);
    if (previous?.status === "running" && next?.id === previous.id && next.status !== "running") {
      setCompletedThisSession(next.status === "success");
      router.refresh();
    }
  }, [router]);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/refresh", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as RefreshResponse;
      if (!response.ok) throw new Error(body.error ?? "갱신 상태를 확인하지 못했습니다.");
      setLocalError("");
      applyRun(body.run ?? null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "갱신 상태를 확인하지 못했습니다.");
    }
  }, [applyRun]);

  useEffect(() => {
    if (runRef.current?.status !== "running") return;
    const timer = window.setInterval(checkStatus, 2_000);
    return () => window.clearInterval(timer);
  }, [checkStatus, run?.status]);

  async function startRefresh(extraBody?: Record<string, unknown>): Promise<boolean> {
    if (starting || runRef.current?.status === "running") return false;
    setStarting(true);
    setLocalError("");
    setCompletedThisSession(false);
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, ...extraBody }),
        keepalive: true,
      });
      const body = (await response.json()) as RefreshResponse;
      if (!response.ok) {
        await checkStatus();
        throw new Error(body.error ?? "갱신 작업을 시작하지 못했습니다.");
      }
      applyRun(body.run ?? null);
      return true;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "갱신 작업을 시작하지 못했습니다.");
      return false;
    } finally {
      setStarting(false);
    }
  }

  const running = run?.status === "running";
  const ownRun = run?.source === source;
  let message = localError;
  let isError = Boolean(localError);
  if (!message && running) {
    if (!ownRun) {
      message = `${sourceLabel(run.source)} 갱신이 진행 중입니다. 완료 후 다시 실행할 수 있습니다.`;
    } else if (run.stage === "saving") {
      message = "수집 결과를 저장하는 중입니다. 페이지를 나가도 계속 진행됩니다…";
    } else if (run.stage === "collecting") {
      message = source === "macro" ? "FRED 데이터를 가져오는 중입니다. 페이지를 나가도 계속 진행됩니다…" : "X 데이터 작업을 처리하는 중입니다. 페이지를 나가도 계속 진행됩니다…";
    } else {
      message = "갱신 작업이 대기열에서 시작을 기다리고 있습니다. 페이지를 나가도 됩니다…";
    }
  } else if (!message && ownRun && run?.status === "failed") {
    message = `최근 갱신 실패: ${run.error ?? "알 수 없는 오류"}`;
    isError = true;
  } else if (!message && ownRun && run?.status === "success" && completedThisSession) {
    message = source === "macro" ? "새 FRED 데이터를 저장했습니다." : "X 작업 결과를 저장했습니다.";
  }

  return {
    run,
    running,
    ownRun,
    starting,
    busy: starting || running,
    message,
    isError,
    startRefresh,
  };
}
