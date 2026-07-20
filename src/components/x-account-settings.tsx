"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface XAccountSettingsProps {
  initialAccounts: string[];
  source: "database" | "environment" | "none";
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
}: XAccountSettingsProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function addAccounts() {
    const candidates = normalize(input);
    if (!candidates.length) return;
    if (candidates.some((username) => !/^[a-z0-9_]{1,30}$/.test(username))) {
      setIsError(true);
      setMessage("username은 영문, 숫자, 밑줄만 입력하세요.");
      return;
    }
    const next = [...new Set([...accounts, ...candidates])];
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
        body: JSON.stringify({ usernames: accounts }),
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
      <div className="settings-card-head"><div><p className="kicker">MONITORED ACCOUNTS</p><h2>X 모니터링 계정</h2></div><span>{accounts.length} / 10</span></div>
      <div className="settings-body">
        <p>추가하거나 삭제한 뒤 저장하세요. 계정 목록 변경만으로는 API를 호출하지 않으며, 다음 <b>데이터 갱신</b>부터 적용됩니다.</p>
        {source === "environment" ? <p className="legacy-note">현재 Vercel의 <code>X_TARGET_USERNAMES</code> 값을 임시로 표시하고 있습니다. 여기서 저장하면 Supabase 설정으로 전환됩니다.</p> : null}
        <div className="account-chips">
          {accounts.map((username) => (
            <span className="account-chip" key={username}>@{username}<button type="button" onClick={() => setAccounts(accounts.filter((item) => item !== username))} aria-label={`@${username} 삭제`}>×</button></span>
          ))}
          {!accounts.length ? <span className="no-accounts">등록된 계정이 없습니다.</span> : null}
        </div>
        <form className="account-add-form" onSubmit={handleSubmit}>
          <label htmlFor="x-username">X username</label>
          <div><input id="x-username" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="예: unusual_whales" autoComplete="off" /><button type="submit" disabled={!input.trim()}>추가</button></div>
          <small>@는 생략해도 됩니다. 쉼표로 여러 계정을 한 번에 입력할 수 있습니다.</small>
        </form>
        <div className="settings-save-row"><span>{accounts.length} / 10</span><button className="primary-button" type="button" onClick={save} disabled={saving}>{saving ? "저장 중…" : "계정 목록 저장"}</button></div>
        {message ? <p className={isError ? "settings-message error" : "settings-message"} role="status">{message}</p> : null}
      </div>
    </section>
  );
}
