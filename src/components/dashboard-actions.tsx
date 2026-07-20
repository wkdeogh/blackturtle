"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function refresh() {
    if (loading) return;
    setLoading(true);
    setIsError(false);
    setMessage("FRED와 X 데이터를 가져오는 중입니다…");
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "갱신하지 못했습니다.");
      setMessage("새 스냅샷을 저장했습니다.");
      router.refresh();
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "갱신하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "action-wrap compact" : "action-wrap"}>
      <button className="primary-button refresh-button" type="button" onClick={refresh} disabled={loading}>
        <span className={loading ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
        {loading ? "갱신 중" : "데이터 갱신"}
      </button>
      {message ? <p className={isError ? "action-message error" : "action-message"} role="status">{message}</p> : null}
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
