"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HistoryRetentionSettings({
  initialLimit,
  migrationReady,
}: {
  initialLimit: number;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(initialLimit));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function save() {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 5 || parsed > 100) {
      setIsError(true);
      setMessage("5~100 사이의 정수를 입력하세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch("/api/settings/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionLimit: parsed }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "보관 설정을 저장하지 못했습니다.");
      setMessage("저장했습니다. 다음 갱신 성공 시 이 개수에 맞춰 정리됩니다.");
      router.refresh();
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "보관 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="history-control">
      <div>
        <p className="kicker">RETENTION</p>
        <h2>히스토리 보관 개수</h2>
        <p>성공한 갱신 결과를 최신순으로 보관합니다. 제한을 바꾸면 다음 갱신 성공 시 오래된 결과부터 정리합니다.</p>
      </div>
      <div className="history-control-form">
        <label htmlFor="history-retention-limit">최대 개수</label>
        <div><input id="history-retention-limit" type="number" inputMode="numeric" min="5" max="100" step="1" value={limit} onChange={(event) => setLimit(event.target.value)} disabled={!migrationReady || saving} /><button className="primary-button" type="button" onClick={save} disabled={!migrationReady || saving}>{saving ? "저장 중…" : "저장"}</button></div>
        <small>5~100회 · 기본값 30회</small>
        {message ? <p className={isError ? "settings-message error" : "settings-message"} role="status">{message}</p> : null}
      </div>
    </section>
  );
}
