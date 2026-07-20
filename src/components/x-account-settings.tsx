"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { XMonitorAccountSetting } from "@/lib/supabase";

interface XAccountSettingsProps {
  initialAccounts: XMonitorAccountSetting[];
  source: "database" | "environment" | "none";
  statusReady: boolean;
}

function normalize(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((username) => username.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export function XAccountSettings({
  initialAccounts,
  source,
  statusReady,
}: XAccountSettingsProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function addAccounts() {
    const candidates = [...new Set(normalize(input))];
    if (!candidates.length) return;
    if (candidates.some((username) => !/^[a-z0-9_]{1,30}$/.test(username))) {
      setIsError(true);
      setMessage("username은 영문, 숫자, 밑줄만 입력하세요.");
      return;
    }
    const existing = new Set(accounts.map((account) => account.username));
    const next = [...accounts, ...candidates.filter((username) => !existing.has(username)).map((username) => ({ username, enabled: true }))];
    if (next.length > 10) {
      setIsError(true);
      setMessage("MVP에서는 최대 10개 계정까지 모니터링할 수 있습니다.");
      return;
    }
    setAccounts(next);
    setInput("");
    setMessage("");
    setIsError(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addAccounts();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === ",") {
      event.preventDefault();
      addAccounts();
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch("/api/settings/x-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "저장하지 못했습니다.");
      setMessage("저장했습니다. 다음 데이터 갱신부터 적용됩니다.");
      router.refresh();
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="monitor-settings settings-card">
      <div className="settings-card-head"><div><p className="kicker">MONITORED ACCOUNTS</p><h2>X 모니터링 계정</h2></div><span>{accounts.filter((account) => account.enabled).length}개 활성 · {accounts.length} / 10</span></div>
      <div className="settings-body">
        <p>체크된 계정만 다음 수집에서 사용합니다. 비활성화하면 목록과 기존 결과는 남고, 새 X API 수집에서만 제외됩니다.</p>
        {source === "environment" ? <p className="legacy-note">현재 Vercel의 <code>X_TARGET_USERNAMES</code> 값을 임시로 표시하고 있습니다. 여기서 저장하면 Supabase 설정으로 전환됩니다.</p> : null}
        <div className="account-setting-list">
          {accounts.map((account) => (
            <div className={account.enabled ? "account-setting-row" : "account-setting-row disabled"} key={account.username}>
              <label><input type="checkbox" checked={account.enabled} onChange={(event) => setAccounts(accounts.map((item) => item.username === account.username ? { ...item, enabled: event.target.checked } : item))} /><span><strong>@{account.username}</strong><small>{account.enabled ? "다음 수집에 포함" : "수집에서 제외"}</small></span></label>
              <button type="button" onClick={() => setAccounts(accounts.filter((item) => item.username !== account.username))} aria-label={`@${account.username} 삭제`}>삭제</button>
            </div>
          ))}
          {!accounts.length ? <span className="no-accounts">등록된 계정이 없습니다.</span> : null}
        </div>
        <form className="account-add-form" onSubmit={handleSubmit}>
          <label htmlFor="x-username">X username</label>
          <div><input id="x-username" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="예: unusual_whales" autoComplete="off" /><button type="submit" disabled={!input.trim()}>추가</button></div>
          <small>@는 생략해도 됩니다. 쉼표로 여러 계정을 한 번에 입력할 수 있습니다.</small>
        </form>
        <div className="settings-save-row"><span>{accounts.filter((account) => account.enabled).length}개 계정이 다음 수집 대상입니다.</span><button className="primary-button" type="button" onClick={save} disabled={saving || !statusReady}>{saving ? "저장 중…" : "계정 설정 저장"}</button></div>
        {message ? <p className={isError ? "settings-message error" : "settings-message"} role="status">{message}</p> : null}
      </div>
    </section>
  );
}
