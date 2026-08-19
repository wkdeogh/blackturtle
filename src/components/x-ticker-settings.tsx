"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { XTickerMonitorSetting } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import { MAX_ACTIVE_X_TICKERS, MAX_SAVED_X_TICKERS } from "@/lib/x-ticker-limits";

function signature(tickers: XTickerMonitorSetting[]) {
  return tickers.map((item) => `${item.ticker}:${item.companyName}:${item.enabled ? 1 : 0}`).join("|");
}

export function XTickerSettings({ initialTickers, migrationReady }: { initialTickers: XTickerMonitorSetting[]; migrationReady: boolean }) {
  const router = useRouter();
  const [tickers, setTickers] = useState(initialTickers);
  const [savedTickers, setSavedTickers] = useState(initialTickers);
  const [tickerInput, setTickerInput] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const activeCount = tickers.filter((ticker) => ticker.enabled).length;
  const hasChanges = useMemo(() => signature(tickers) !== signature(savedTickers), [savedTickers, tickers]);

  function addTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = tickerInput.trim().replace(/^\$/, "").toUpperCase();
    const companyName = companyInput.trim().replace(/\s+/g, " ");
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      setIsError(true); setMessage("티커는 영문으로 시작하는 1~10자 기호로 입력하세요."); return;
    }
    if (companyName.length > 80) {
      setIsError(true); setMessage("기업명은 80자 이내로 입력하세요."); return;
    }
    if (tickers.some((item) => item.ticker === ticker)) {
      setIsError(true); setMessage(`$${ticker}는 이미 등록되어 있습니다.`); return;
    }
    if (tickers.length >= MAX_SAVED_X_TICKERS) {
      setIsError(true); setMessage(`티커는 최대 ${MAX_SAVED_X_TICKERS}개까지 저장할 수 있습니다.`); return;
    }
    const enabled = activeCount < MAX_ACTIVE_X_TICKERS;
    setTickers([...tickers, { ticker, companyName, enabled }]);
    setTickerInput(""); setCompanyInput(""); setIsError(false);
    setMessage(enabled ? "" : `활성 한도 ${MAX_ACTIVE_X_TICKERS}개를 넘어 비활성 상태로 추가했습니다.`);
  }

  function setEnabled(ticker: string, enabled: boolean) {
    if (enabled && activeCount >= MAX_ACTIVE_X_TICKERS) {
      setIsError(true); setMessage(`활성 티커는 최대 ${MAX_ACTIVE_X_TICKERS}개입니다.`); return;
    }
    setTickers(tickers.map((item) => item.ticker === ticker ? { ...item, enabled } : item));
    setMessage(""); setIsError(false);
  }

  async function save() {
    if (saving || !hasChanges) return;
    setSaving(true); setMessage(""); setIsError(false);
    try {
      const response = await fetch("/api/settings/x-tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "티커 설정을 저장하지 못했습니다.");
      setSavedTickers(tickers);
      setMessage("저장했습니다. 다음 티커 검색부터 적용됩니다.");
      showToast("X 티커 모니터링 설정을 저장했습니다.");
      router.refresh();
    } catch (error) {
      setTickers(savedTickers);
      const text = error instanceof Error ? error.message : "티커 설정을 저장하지 못했습니다.";
      setIsError(true); setMessage(`저장에 실패해 마지막 상태로 되돌렸습니다. ${text}`);
      showToast(text, "error");
    } finally {
      setSaving(false);
    }
  }

  return <section className="monitor-settings settings-card ticker-settings-card">
    <div className="settings-card-head"><div><p className="kicker">TICKER WATCHLIST</p><h2>검색 티커</h2></div><span>{activeCount} / {MAX_ACTIVE_X_TICKERS} 활성 · {tickers.length} 저장</span></div>
    <div className="settings-body">
      <p>캐시태그($NVDA)와 선택 입력한 기업명을 함께 검색합니다. 일반 단어와 겹치는 티커는 기업명을 입력하면 검색 정확도가 좋아집니다.</p>
      <div className="ticker-setting-list">
        {tickers.map((item) => <div className={item.enabled ? "ticker-setting-row" : "ticker-setting-row disabled"} key={item.ticker}>
          <label><input type="checkbox" checked={item.enabled} disabled={saving} onChange={(event) => setEnabled(item.ticker, event.target.checked)} /><span><strong>${item.ticker}</strong><small>{item.companyName || "캐시태그만 검색"}</small></span></label>
          <button type="button" disabled={saving} onClick={() => setTickers(tickers.filter((ticker) => ticker.ticker !== item.ticker))} aria-label={`$${item.ticker} 삭제`}>삭제</button>
        </div>)}
        {!tickers.length ? <div className="ticker-empty"><b>등록된 검색 티커가 없습니다.</b><span>아래에서 IONQ, NVDA 같은 티커를 추가하세요.</span></div> : null}
      </div>
      <form className="ticker-add-form" onSubmit={addTicker}>
        <label><span>티커</span><input value={tickerInput} onChange={(event) => setTickerInput(event.target.value)} placeholder="예: NVDA" autoCapitalize="characters" autoComplete="off" /></label>
        <label><span>기업명 <small>선택</small></span><input value={companyInput} onChange={(event) => setCompanyInput(event.target.value)} placeholder="예: NVIDIA" autoComplete="off" /></label>
        <button type="submit" disabled={saving || !tickerInput.trim()}>추가</button>
      </form>
      <div className="ticker-cost-note"><b>비용 관리</b><span>검색량이 많은 티커는 게시물이 빠르게 늘어납니다. 처음에는 최근 1일·티커당 20개·전체 50개를 권장합니다.</span></div>
      <div className="settings-save-row"><span>{hasChanges ? "저장되지 않은 변경이 있습니다." : `${activeCount}개 티커가 다음 검색 대상입니다.`}</span><button className="primary-button" type="button" onClick={() => void save()} disabled={saving || !migrationReady || !hasChanges}>{saving ? "저장 중…" : hasChanges ? "티커 설정 저장" : "저장됨"}</button></div>
      {message ? <p className={isError ? "settings-message error" : "settings-message"} role="status">{message}</p> : null}
    </div>
  </section>;
}
