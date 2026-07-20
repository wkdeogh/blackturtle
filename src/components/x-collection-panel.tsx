"use client";

import { useState } from "react";
import { useRefreshJob } from "@/components/use-refresh-job";
import type { RefreshRunStatus } from "@/lib/types";

interface XCollectionPanelProps {
  initialLookbackDays: number;
  initialPerAccountPostLimit: number | null;
  initialTotalPostLimit: number | null;
  accountCount: number;
  initialRun: RefreshRunStatus | null;
}

export function XCollectionPanel({
  initialLookbackDays,
  initialPerAccountPostLimit,
  initialTotalPostLimit,
  accountCount,
  initialRun,
}: XCollectionPanelProps) {
  const refresh = useRefreshJob("social", initialRun);
  const [lookbackDays, setLookbackDays] = useState(initialLookbackDays);
  const [perAccountPostLimit, setPerAccountPostLimit] = useState(initialPerAccountPostLimit?.toString() ?? "");
  const [totalPostLimit, setTotalPostLimit] = useState(initialTotalPostLimit?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function saveAndCollect() {
    if (saving || refresh.running || !accountCount) return;
    setSaving(true);
    setIsError(false);
    setMessage("수집 설정을 저장하고 작업을 등록하는 중입니다…");
    try {
      setMessage("");
      await refresh.startRefresh({
        collectionSettings: {
          lookbackDays,
          perAccountPostLimit: perAccountPostLimit ? Number(perAccountPostLimit) : null,
          totalPostLimit: totalPostLimit ? Number(totalPostLimit) : null,
        },
      });
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "X 데이터를 수집하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="collection-panel">
      <div className="collection-panel-head">
        <div><p className="kicker">COLLECTION CONTROL</p><h2>X 데이터 수집</h2></div>
        <span>{accountCount ? `${accountCount}개 계정` : "계정 설정 필요"}</span>
      </div>
      <div className="collection-fields">
        <div className="lookback-field">
          <label htmlFor="x-lookback-days">수집 기간</label>
          <select id="x-lookback-days" value={lookbackDays} onChange={(event) => setLookbackDays(Number(event.target.value))}>
            {[1, 3, 7, 14, 30].map((days) => <option value={days} key={days}>최근 {days}일</option>)}
          </select>
        </div>
        <div className="post-limit-grid">
          <div>
            <label htmlFor="x-per-account-limit">계정당 최대 게시물</label>
            <input id="x-per-account-limit" type="number" inputMode="numeric" min="1" step="1" value={perAccountPostLimit} onChange={(event) => setPerAccountPostLimit(event.target.value)} placeholder="무제한" />
          </div>
          <div>
            <label htmlFor="x-total-limit">전체 최대 게시물</label>
            <input id="x-total-limit" type="number" inputMode="numeric" min="1" step="1" value={totalPostLimit} onChange={(event) => setTotalPostLimit(event.target.value)} placeholder="무제한" />
          </div>
        </div>
      </div>
      <div className="collection-action-row">
        <p>빈 상한은 날짜 조건만 적용합니다. 범위가 넓을수록 X API 호출량과 비용이 늘 수 있습니다.</p>
        <button className="primary-button refresh-button" type="button" onClick={saveAndCollect} disabled={saving || refresh.running || !accountCount}>
          <span className={saving || refresh.running ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
          {saving ? "설정 저장 중" : refresh.running ? (refresh.ownRun ? "수집 중" : "다른 갱신 중") : "설정 저장 후 X 수집"}
        </button>
      </div>
      {message || refresh.message ? <p className={isError || refresh.isError ? "action-message error" : "action-message"} role="status">{message || refresh.message}</p> : null}
    </section>
  );
}
