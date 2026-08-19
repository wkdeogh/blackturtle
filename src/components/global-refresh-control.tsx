"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRefreshJob } from "@/components/use-refresh-job";
import { OPENAI_COMPREHENSIVE_MODELS, type OpenAIComprehensiveModel } from "@/lib/openai-config";
import { showToast } from "@/lib/toast";
import type { ComprehensiveAnalysisRunStatus, RefreshTarget } from "@/lib/types";

interface CollectionSettingsResponse {
  lookbackDays?: number;
  perAccountPostLimit?: number | null;
  totalPostLimit?: number | null;
  activeAccountCount?: number;
  activeTickerCount?: number;
  tickerLookbackDays?: number;
  perTickerPostLimit?: number | null;
  tickerTotalPostLimit?: number | null;
  error?: string;
}

interface AnalysisPreview {
  snapshotId: string;
  model: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  dataCounts: { macro: number; market: number; posts: number };
}

const TARGET_OPTIONS: Array<{ id: RefreshTarget | "analysis"; label: string; description: string }> = [
  { id: "macro", label: "매크로", description: "FRED·공포탐욕·원유 데이터" },
  { id: "market", label: "시장지수", description: "주요 시장·국가 ETF 가격" },
  { id: "social", label: "모니터링", description: "X 수집·기업 감성·주제 분석" },
  { id: "analysis", label: "종합분석", description: "새 저장 데이터로 AI 리포트 작성" },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function GlobalRefreshControl() {
  const refresh = useRefreshJob("all", null);
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState({ macro: true, market: true, social: true, analysis: false });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [lookbackDays, setLookbackDays] = useState("7");
  const [perAccountPostLimit, setPerAccountPostLimit] = useState("");
  const [totalPostLimit, setTotalPostLimit] = useState("");
  const [activeAccountCount, setActiveAccountCount] = useState(0);
  const [activeTickerCount, setActiveTickerCount] = useState(0);
  const [tickerLookbackDays, setTickerLookbackDays] = useState("1");
  const [perTickerPostLimit, setPerTickerPostLimit] = useState("20");
  const [tickerTotalPostLimit, setTickerTotalPostLimit] = useState("50");
  const [selectedModel, setSelectedModel] = useState<OpenAIComprehensiveModel>(OPENAI_COMPREHENSIVE_MODELS[0]);
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analysisRun, setAnalysisRun] = useState<ComprehensiveAnalysisRunStatus | null>(null);
  const [error, setError] = useState("");
  const checkRefreshStatus = refresh.checkStatus;

  const dataTargets = useMemo(() => (["macro", "market", "social"] as RefreshTarget[]).filter((target) => targets[target]), [targets]);
  const analysisRunning = analysisRun?.status === "running";
  const busy = refresh.busy || previewLoading || submitting;

  useEffect(() => {
    void checkRefreshStatus();
  }, [checkRefreshStatus]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, open]);

  useEffect(() => {
    if (!analysisRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/comprehensive-analysis", { cache: "no-store" });
        const body = (await response.json()) as { run?: ComprehensiveAnalysisRunStatus | null };
        if (!response.ok) return;
        const next = body.run ?? null;
        setAnalysisRun(next);
        if (next?.status === "success") showToast("종합분석을 완료했습니다.");
        if (next?.status === "failed") showToast(next.error ?? "종합분석에 실패했습니다.", "error");
      } catch {
        // The analysis page and global indicator also expose durable status.
      }
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [analysisRunning]);

  async function openDialog() {
    setOpen(true);
    setError("");
    setPreview(null);
    setSettingsLoading(true);
    try {
      const [settingsResponse, analysisResponse] = await Promise.all([
        fetch("/api/settings/x-collection", { cache: "no-store" }),
        fetch("/api/comprehensive-analysis", { cache: "no-store" }),
      ]);
      const settingsBody = (await settingsResponse.json()) as CollectionSettingsResponse;
      if (!settingsResponse.ok) throw new Error(settingsBody.error ?? "X 수집 설정을 불러오지 못했습니다.");
      setLookbackDays(String(settingsBody.lookbackDays ?? 7));
      setPerAccountPostLimit(settingsBody.perAccountPostLimit?.toString() ?? "");
      setTotalPostLimit(settingsBody.totalPostLimit?.toString() ?? "");
      setActiveAccountCount(settingsBody.activeAccountCount ?? 0);
      setActiveTickerCount(settingsBody.activeTickerCount ?? 0);
      setTickerLookbackDays(String(settingsBody.tickerLookbackDays ?? 1));
      setPerTickerPostLimit(settingsBody.perTickerPostLimit?.toString() ?? "");
      setTickerTotalPostLimit(settingsBody.tickerTotalPostLimit?.toString() ?? "");
      if (analysisResponse.ok) {
        const analysisBody = (await analysisResponse.json()) as { run?: ComprehensiveAnalysisRunStatus | null };
        const nextAnalysisRun = analysisBody.run ?? null;
        setAnalysisRun(nextAnalysisRun);
        if (nextAnalysisRun?.status === "running") {
          setTargets((current) => ({ ...current, analysis: false }));
        }
      }
      await checkRefreshStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "갱신 설정을 불러오지 못했습니다.");
    } finally {
      setSettingsLoading(false);
    }
  }

  function toggleTarget(target: RefreshTarget | "analysis") {
    setTargets((current) => ({ ...current, [target]: !current[target] }));
    setPreview(null);
    setError("");
  }

  function collectionSettings() {
    return {
      lookbackDays: Number(lookbackDays),
      perAccountPostLimit: perAccountPostLimit ? Number(perAccountPostLimit) : null,
      totalPostLimit: totalPostLimit ? Number(totalPostLimit) : null,
    };
  }

  function tickerCollectionSettings() {
    return {
      lookbackDays: Number(tickerLookbackDays),
      perTickerPostLimit: perTickerPostLimit ? Number(perTickerPostLimit) : null,
      totalPostLimit: tickerTotalPostLimit ? Number(tickerTotalPostLimit) : null,
    };
  }

  function validate(): string | null {
    if (!dataTargets.length && !targets.analysis) return "갱신할 항목을 한 개 이상 선택하세요.";
    if (targets.analysis && analysisRunning) return "이미 종합분석이 진행 중입니다. 완료된 뒤 다시 선택하세요.";
    if (targets.social) {
      if (!activeAccountCount && !activeTickerCount) return "모니터링을 실행하려면 활성 계정 또는 티커를 한 개 이상 선택하세요.";
      if (activeAccountCount) {
        const settings = collectionSettings();
        if (!Number.isInteger(settings.lookbackDays) || settings.lookbackDays < 1 || settings.lookbackDays > 30) return "계정 모니터링 기간은 1~30일 사이의 정수로 입력하세요.";
        if (settings.perAccountPostLimit !== null && (!Number.isInteger(settings.perAccountPostLimit) || settings.perAccountPostLimit < 1)) return "계정당 최대 게시물은 비우거나 1 이상의 정수로 입력하세요.";
        if (settings.totalPostLimit !== null && (!Number.isInteger(settings.totalPostLimit) || settings.totalPostLimit < 1)) return "계정 수집 전체 상한은 비우거나 1 이상의 정수로 입력하세요.";
      }
      if (activeTickerCount) {
        const settings = tickerCollectionSettings();
        if (!Number.isInteger(settings.lookbackDays) || settings.lookbackDays < 1 || settings.lookbackDays > 7) return "티커 검색 기간은 1~7일 사이의 정수로 입력하세요.";
        if (settings.perTickerPostLimit !== null && (!Number.isInteger(settings.perTickerPostLimit) || settings.perTickerPostLimit < 1)) return "티커당 최대 게시물은 비우거나 1 이상의 정수로 입력하세요.";
        if (settings.totalPostLimit !== null && (!Number.isInteger(settings.totalPostLimit) || settings.totalPostLimit < 1)) return "티커 검색 전체 상한은 비우거나 1 이상의 정수로 입력하세요.";
      }
    }
    return null;
  }

  async function requestPreview(): Promise<void> {
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/comprehensive-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", model: selectedModel }),
      });
      const body = (await response.json()) as AnalysisPreview & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "종합분석 예상 토큰을 계산하지 못했습니다.");
      setPreview(body);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function execute() {
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (targets.analysis && !preview) {
      try {
        await requestPreview();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "종합분석 비용을 확인하지 못했습니다.");
      }
      return;
    }

    if (!dataTargets.length && targets.analysis && preview) {
      setSubmitting(true);
      try {
        const response = await fetch("/api/comprehensive-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", snapshotId: preview.snapshotId, model: selectedModel }),
          keepalive: true,
        });
        const body = (await response.json()) as { run?: ComprehensiveAnalysisRunStatus | null; error?: string };
        if (!response.ok) throw new Error(body.error ?? "종합분석을 시작하지 못했습니다.");
        setAnalysisRun(body.run ?? null);
        window.dispatchEvent(new Event("blackturtle:refresh-started"));
        setOpen(false);
        showToast("종합분석을 시작했습니다.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "종합분석을 시작하지 못했습니다.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (targets.social && activeTickerCount) {
      setSubmitting(true);
      try {
        const response = await fetch("/api/settings/x-ticker-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tickerCollectionSettings()),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "티커 검색 설정을 저장하지 못했습니다.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "티커 검색 설정을 저장하지 못했습니다.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }

    const started = await refresh.startRefresh({
      targets: dataTargets,
      socialMode: "collect_and_analyze",
      socialScope: "all",
      collectionSettings: targets.social && activeAccountCount ? collectionSettings() : undefined,
      runComprehensiveAnalysis: targets.analysis,
      comprehensiveModel: targets.analysis ? selectedModel : undefined,
    });
    if (started) {
      setOpen(false);
      showToast(targets.analysis ? "선택한 데이터를 갱신한 뒤 종합분석을 시작합니다." : "선택한 데이터 갱신을 시작했습니다.");
    }
  }

  return (
    <>
      <button className="global-refresh-button" type="button" onClick={() => void openDialog()} disabled={refresh.busy || submitting} aria-label="전체 갱신 설정 열기">
        <span className={refresh.running ? "spinning" : ""} aria-hidden="true">↻</span><b>{refresh.running ? "갱신 중" : "전체 갱신"}</b>
      </button>
      {open ? createPortal(<div className="global-refresh-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
        <section className="global-refresh-modal" role="dialog" aria-modal="true" aria-labelledby="global-refresh-title">
          <header><div><p className="kicker">GLOBAL REFRESH</p><h2 id="global-refresh-title">갱신 항목 선택</h2></div><button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="닫기">×</button></header>
          <p className="global-refresh-copy">선택한 항목만 순서대로 처리합니다. 페이지를 나가도 등록된 작업은 계속 진행됩니다.</p>
          <div className="global-refresh-targets">
            {TARGET_OPTIONS.map((option) => <label className={targets[option.id] ? "selected" : ""} key={option.id}>
              <input type="checkbox" checked={targets[option.id]} onChange={() => toggleTarget(option.id)} disabled={busy || (option.id === "analysis" && analysisRunning)} />
              <span><b>{option.label}</b><small>{option.description}{option.id === "analysis" && analysisRunning ? " · 현재 진행 중" : ""}</small></span>
            </label>)}
          </div>

          {targets.social ? <fieldset className="global-social-settings" disabled={busy || settingsLoading}>
            <legend>모니터링 수집 조건</legend>
            {activeAccountCount ? <div className="global-monitor-source"><div><b>계정 모니터링</b><small>활성 {activeAccountCount}개 · 최근 1~30일</small></div><div className="global-refresh-fields">
              <label><span>수집 기간</span><div><input type="number" inputMode="numeric" min="1" max="30" step="1" value={lookbackDays} onChange={(event) => { setLookbackDays(event.target.value); setPreview(null); }} /><small>일</small></div></label>
              <label><span>계정당 최대</span><input type="number" inputMode="numeric" min="1" step="1" value={perAccountPostLimit} onChange={(event) => { setPerAccountPostLimit(event.target.value); setPreview(null); }} placeholder="무제한" /></label>
              <label><span>계정 수집 전체</span><input type="number" inputMode="numeric" min="1" step="1" value={totalPostLimit} onChange={(event) => { setTotalPostLimit(event.target.value); setPreview(null); }} placeholder="무제한" /></label>
            </div></div> : null}
            {activeTickerCount ? <div className="global-monitor-source"><div><b>티커 모니터링</b><small>활성 {activeTickerCount}개 · Recent Search 1~7일</small></div><div className="global-refresh-fields">
              <label><span>검색 기간</span><div><input type="number" inputMode="numeric" min="1" max="7" step="1" value={tickerLookbackDays} onChange={(event) => { setTickerLookbackDays(event.target.value); setPreview(null); }} /><small>일</small></div></label>
              <label><span>티커당 최대</span><input type="number" inputMode="numeric" min="1" step="1" value={perTickerPostLimit} onChange={(event) => { setPerTickerPostLimit(event.target.value); setPreview(null); }} placeholder="무제한" /></label>
              <label><span>티커 검색 전체</span><input type="number" inputMode="numeric" min="1" step="1" value={tickerTotalPostLimit} onChange={(event) => { setTickerTotalPostLimit(event.target.value); setPreview(null); }} placeholder="무제한" /></label>
            </div></div> : null}
            {!activeAccountCount && !activeTickerCount ? <small className="global-account-count">활성 계정 또는 티커를 먼저 설정하세요.</small> : null}
          </fieldset> : null}

          {targets.analysis ? <div className="global-analysis-settings">
            <label htmlFor="global-analysis-model">종합분석 모델</label>
            <select id="global-analysis-model" value={selectedModel} onChange={(event) => { setSelectedModel(event.target.value as OpenAIComprehensiveModel); setPreview(null); }} disabled={busy}>
              {OPENAI_COMPREHENSIVE_MODELS.map((model) => <option value={model} key={model}>{model}</option>)}
            </select>
            {preview ? <aside><b>현재 저장 데이터 기준 예상 입력 약 {formatNumber(preview.estimatedInputTokens)} tokens</b><span>출력 상한 {formatNumber(preview.maxOutputTokens)} tokens · 실제 사용량은 새로 수집되는 데이터와 reasoning에 따라 달라질 수 있습니다.</span></aside> : <small>OpenAI API 요금이 발생합니다. 실행 전 예상 입력 토큰을 한 번 더 확인합니다.</small>}
          </div> : null}

          {settingsLoading ? <p className="global-refresh-status-text" role="status">설정을 불러오는 중…</p> : error || refresh.message ? <p className="global-refresh-error" role="alert">{error || refresh.message}</p> : null}
          <footer><button className="secondary-button" type="button" onClick={() => setOpen(false)} disabled={busy}>취소</button><button className="combined-button" type="button" onClick={() => void execute()} disabled={busy || settingsLoading}>{previewLoading ? "토큰 계산 중…" : targets.analysis ? (preview ? "확인 후 실행" : "비용 확인") : "선택 항목 갱신"}</button></footer>
        </section>
      </div>, document.body) : null}
    </>
  );
}
