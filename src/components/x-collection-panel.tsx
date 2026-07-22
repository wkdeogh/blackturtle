"use client";

import { useState } from "react";
import { useRefreshJob } from "@/components/use-refresh-job";
import type { RefreshRunStatus } from "@/lib/types";

interface XCollectionPanelProps {
  initialLookbackDays: number;
  initialPerAccountPostLimit: number | null;
  initialTotalPostLimit: number | null;
  accountCount: number;
  storedPostCount: number;
  initialRun: RefreshRunStatus | null;
}

export function XCollectionPanel({
  initialLookbackDays,
  initialPerAccountPostLimit,
  initialTotalPostLimit,
  accountCount,
  storedPostCount,
  initialRun,
}: XCollectionPanelProps) {
  const refresh = useRefreshJob("social", initialRun);
  const [lookbackDays, setLookbackDays] = useState(initialLookbackDays);
  const [perAccountPostLimit, setPerAccountPostLimit] = useState(initialPerAccountPostLimit?.toString() ?? "");
  const [totalPostLimit, setTotalPostLimit] = useState(initialTotalPostLimit?.toString() ?? "");
  const [action, setAction] = useState<"collect" | "analyze" | "combined" | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function saveAndCollect() {
    if (action || refresh.running || !accountCount) return;
    setAction("collect");
    setIsError(false);
    setMessage("수집 설정을 저장하고 작업을 등록하는 중입니다…");
    try {
      setMessage("");
      await refresh.startRefresh({
        socialMode: "collect_only",
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
      setAction(null);
    }
  }

  async function analyzeStoredPosts() {
    if (action || refresh.running || !storedPostCount) return;
    setAction("analyze");
    setIsError(false);
    setMessage("");
    try {
      await refresh.startRefresh({ socialMode: "analyze_only" });
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "저장된 게시물을 분석하지 못했습니다.");
    } finally {
      setAction(null);
    }
  }

  async function collectAndAnalyze() {
    if (action || refresh.running || !accountCount) return;
    setAction("combined");
    setIsError(false);
    setMessage("");
    try {
      await refresh.startRefresh({
        socialMode: "collect_and_analyze",
        collectionSettings: {
          lookbackDays,
          perAccountPostLimit: perAccountPostLimit ? Number(perAccountPostLimit) : null,
          totalPostLimit: totalPostLimit ? Number(totalPostLimit) : null,
        },
      });
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "X 수집과 LLM 분석을 시작하지 못했습니다.");
    } finally {
      setAction(null);
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
        <p>X만 수집하거나 저장된 {storedPostCount}개 게시물만 재분석할 수 있습니다. 통합 실행은 현재 설정을 저장한 뒤 X 수집과 LLM 분석을 연속으로 처리합니다.</p>
        <div className="collection-buttons">
          <button className="secondary-button refresh-button" type="button" onClick={analyzeStoredPosts} disabled={Boolean(action) || refresh.running || !storedPostCount}>
            <span className={action === "analyze" ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">◇</span>
            {action === "analyze" ? "분석 요청 중" : refresh.running ? "작업 진행 중" : "저장 데이터 LLM 재분석"}
          </button>
          <button className="primary-button refresh-button" type="button" onClick={saveAndCollect} disabled={Boolean(action) || refresh.running || !accountCount}>
            <span className={action === "collect" ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
            {action === "collect" ? "설정 저장 중" : refresh.running ? (refresh.ownRun ? "작업 진행 중" : "다른 갱신 중") : "설정 저장 후 X만 수집"}
          </button>
          <button className="combined-button refresh-button" type="button" onClick={collectAndAnalyze} disabled={Boolean(action) || refresh.running || !accountCount}>
            <span className={action === "combined" ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
            {action === "combined" ? "통합 요청 중" : refresh.running ? "작업 진행 중" : "X 수집 + LLM 분석"}
          </button>
        </div>
      </div>
      {message || refresh.message ? <p className={isError || refresh.isError ? "action-message error" : "action-message"} role="status">{message || refresh.message}</p> : null}
    </section>
  );
}
