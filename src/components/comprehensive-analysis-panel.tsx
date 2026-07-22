"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { OPENAI_COMPREHENSIVE_MODELS, type OpenAIComprehensiveModel } from "@/lib/openai-config";
import type { ComprehensiveAnalysisRunStatus, StoredComprehensiveAnalysis } from "@/lib/types";

interface Preview {
  snapshotId: string;
  model: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  dataCounts: { macro: number; market: number; posts: number };
}

interface ManualPrompt {
  prompt: string;
  snapshotId: string;
  estimatedInputTokens: number;
}

function number(value: number): string { return new Intl.NumberFormat("ko-KR").format(value); }

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("클립보드 복사 권한을 확인하세요.");
}

const MODEL_DESCRIPTIONS: Record<OpenAIComprehensiveModel, string> = {
  "gpt-5.6-sol": "최고 성능",
  "gpt-5.6-terra": "성능·비용 균형",
  "gpt-5.6-luna": "빠르고 비용 효율적",
};

function shortText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength);
  const sentenceEnd = clipped.lastIndexOf(".");
  return `${(sentenceEnd > maxLength * 0.55 ? clipped.slice(0, sentenceEnd + 1) : clipped).trim()}…`;
}

function ReportList({ items }: { items: string[] }) {
  return items.length ? <ul>{items.slice(0, 2).map((item, index) => <li key={`${index}-${item}`}>{shortText(item, 100)}</li>)}</ul> : <p className="analysis-none">근거가 충분하지 않습니다.</p>;
}

function ComprehensiveReport({ stored, currentSnapshotId }: { stored: StoredComprehensiveAnalysis; currentSnapshotId: string | null }) {
  const report = stored.report;
  const stale = Boolean(currentSnapshotId && report.sourceSnapshotId !== currentSnapshotId);
  return <article className="analysis-report">
    {stale ? <aside className="analysis-stale">이 리포트 작성 후 대시보드 데이터가 갱신됐습니다. 새 데이터 반영이 필요하면 다시 분석하세요.</aside> : null}
    <header className="analysis-report-head">
      <div><p className="kicker">COMPREHENSIVE REPORT</p><h2>{shortText(report.headline, 70)}</h2><p>{shortText(report.executiveSummary, 280)}</p></div>
      <dl><div><dt>작성</dt><dd>{formatDateTime(report.generatedAt)}</dd></div><div><dt>모델</dt><dd>{report.model}</dd></div><div><dt>예상 입력</dt><dd>약 {number(report.estimatedInputTokens)} tokens</dd></div></dl>
    </header>

    <section className="analysis-regime"><span>시장 국면</span><h3>{shortText(report.marketRegime.label, 50)}</h3><p>{shortText(report.marketRegime.summary, 180)}</p><ReportList items={report.marketRegime.evidence} /></section>

    <section className="analysis-section">
      <div className="section-title"><div><p className="kicker">01 · KEY INSIGHTS</p><h2>핵심 인사이트</h2></div><p>중요도순 · 관찰과 추론 분리</p></div>
      <div className="analysis-insight-list">{report.keyInsights.slice(0, 3).map((insight, index) => <article key={`${index}-${insight.title}`}>
        <div className="analysis-card-number">{String(index + 1).padStart(2, "0")}</div><div><div className="analysis-card-title"><h3>{shortText(insight.title, 60)}</h3><span>{insight.confidence} 확신</span></div><p>{shortText(insight.analysis, 220)}</p><details className="analysis-compact-details"><summary>근거 보기</summary><ReportList items={insight.evidence} /></details><aside><b>투자자 관점</b>{shortText(insight.investorImplication, 140)}</aside></div>
      </article>)}</div>
    </section>

    <section className="analysis-section analysis-two-column">
      <div><div className="section-title"><div><p className="kicker">02 · OPPORTUNITIES</p><h2>기회 요인</h2></div></div><div className="analysis-stack">{report.opportunities.slice(0, 2).map((item) => <article className="analysis-simple-card analysis-positive" key={item.title}><h3>{shortText(item.title, 60)}</h3><p>{shortText(item.rationale, 180)}</p><details className="analysis-compact-details"><summary>성립 조건·반대 위험</summary><b>성립 조건</b><ReportList items={item.conditions} /><b>반대 위험</b><ReportList items={item.risks.slice(0, 1)} /></details><small>{item.relatedAssets.slice(0, 4).join(" · ")}</small></article>)}</div></div>
      <div><div className="section-title"><div><p className="kicker">03 · RISKS</p><h2>위험 요인</h2></div></div><div className="analysis-stack">{report.risks.slice(0, 2).map((item) => <article className="analysis-simple-card analysis-negative" key={item.title}><h3>{shortText(item.title, 60)}</h3><p>{shortText(item.transmission, 180)}</p><details className="analysis-compact-details"><summary>확인 신호</summary><ReportList items={item.watchSignals} /></details><small>{item.relatedAssets.slice(0, 4).join(" · ")}</small></article>)}</div></div>
    </section>

    <section className="analysis-section"><div className="section-title"><div><p className="kicker">04 · SCENARIOS</p><h2>조건별 시나리오</h2></div><p>확률 예측이 아닌 확인 조건</p></div><div className="analysis-scenarios">{report.scenarios.slice(0, 3).map((scenario) => <article key={scenario.name}><span>{shortText(scenario.name, 20)}</span><ReportList items={scenario.conditions} /><p><b>예상 영향</b>{shortText(scenario.marketImpact, 110)}</p><p><b>대응 관점</b>{shortText(scenario.response, 90)}</p></article>)}</div></section>

    <section className="analysis-section"><div className="section-title"><div><p className="kicker">05 · WATCHLIST</p><h2>다음 확인 항목</h2></div></div><div className="analysis-watchlist">{report.watchlist.slice(0, 4).map((item, index) => <article key={`${index}-${item.item}`}><span>{index + 1}</span><div><h3>{shortText(item.item, 60)}</h3><p>{shortText(item.currentContext, 100)}</p><small>{shortText(item.whyItMatters, 100)}</small><b>확인 기준 · {shortText(item.trigger, 100)}</b></div></article>)}</div></section>

    <section className="analysis-bottom-line"><p className="kicker">BOTTOM LINE</p><h2>{shortText(report.bottomLine, 320)}</h2>{report.dataCaveats.length ? <details><summary>데이터 한계 {Math.min(report.dataCaveats.length, 3)}건</summary><ReportList items={report.dataCaveats.slice(0, 3)} /></details> : null}<small>대시보드에 저장된 데이터만 사용한 AI 분석이며 투자 조언이 아닙니다.</small></section>
  </article>;
}

export function ComprehensiveAnalysisPanel({ initialRun, initialReport, currentSnapshotId, migrationReady, hasData, analysisModel }: {
  initialRun: ComprehensiveAnalysisRunStatus | null;
  initialReport: StoredComprehensiveAnalysis | null;
  currentSnapshotId: string | null;
  migrationReady: boolean;
  hasData: boolean;
  analysisModel: OpenAIComprehensiveModel;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [selectedModel, setSelectedModel] = useState<OpenAIComprehensiveModel>(analysisModel);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [manualPrompt, setManualPrompt] = useState<ManualPrompt | null>(null);
  const [manualResultOpen, setManualResultOpen] = useState(false);
  const [manualResult, setManualResult] = useState("");
  const [manualSourceModel, setManualSourceModel] = useState("");
  const [manualPromptLoading, setManualPromptLoading] = useState(false);
  const [manualImporting, setManualImporting] = useState(false);
  const [manualNotice, setManualNotice] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const runRef = useRef(initialRun);

  const applyRun = useCallback((next: ComprehensiveAnalysisRunStatus | null) => {
    const previous = runRef.current;
    runRef.current = next;
    setRun(next);
    if (previous?.status === "running" && next?.id === previous.id && next.status !== "running") router.refresh();
  }, [router]);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/comprehensive-analysis", { cache: "no-store" });
      const body = (await response.json()) as { run?: ComprehensiveAnalysisRunStatus | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "분석 상태를 확인하지 못했습니다.");
      setError("");
      applyRun(body.run ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "분석 상태를 확인하지 못했습니다."); }
  }, [applyRun]);

  useEffect(() => {
    if (runRef.current?.status !== "running") return;
    const timer = window.setInterval(checkStatus, 2_500);
    return () => window.clearInterval(timer);
  }, [checkStatus, run?.status]);

  async function requestPreview() {
    setLoadingPreview(true); setError("");
    try {
      const response = await fetch("/api/comprehensive-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", model: selectedModel }) });
      const body = (await response.json()) as Preview & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "토큰을 계산하지 못했습니다.");
      setPreview(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "토큰을 계산하지 못했습니다."); }
    finally { setLoadingPreview(false); }
  }

  async function startAnalysis() {
    if (!preview) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/comprehensive-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", snapshotId: preview.snapshotId, model: preview.model }), keepalive: true });
      const body = (await response.json()) as { run?: ComprehensiveAnalysisRunStatus | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "종합분석을 시작하지 못했습니다.");
      setPreview(null);
      applyRun(body.run ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "종합분석을 시작하지 못했습니다."); }
    finally { setStarting(false); }
  }

  async function requestManualPrompt() {
    setManualPromptLoading(true); setError(""); setManualNotice("");
    try {
      const response = await fetch("/api/comprehensive-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "manual-prompt" }) });
      const body = (await response.json()) as ManualPrompt & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "수동 분석 프롬프트를 만들지 못했습니다.");
      setManualPrompt(body);
      try {
        await copyText(body.prompt);
        setManualNotice(`프롬프트를 복사했습니다 · 예상 입력 약 ${number(body.estimatedInputTokens)} tokens`);
      } catch {
        setManualNotice("프롬프트를 만들었습니다. 창 안의 복사 버튼을 눌러주세요.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "수동 분석 프롬프트를 만들지 못했습니다."); }
    finally { setManualPromptLoading(false); }
  }

  async function copyManualPrompt() {
    if (!manualPrompt) return;
    setError("");
    try { await copyText(manualPrompt.prompt); setManualNotice("프롬프트를 클립보드에 복사했습니다."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "프롬프트를 복사하지 못했습니다."); }
  }

  async function importManualResult() {
    if (!manualResult.trim()) return;
    setManualImporting(true); setError(""); setManualNotice("");
    try {
      const response = await fetch("/api/comprehensive-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "manual-import", result: manualResult, sourceModel: manualSourceModel }) });
      const body = (await response.json()) as { run?: ComprehensiveAnalysisRunStatus | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "수동 분석 결과를 저장하지 못했습니다.");
      setManualResultOpen(false);
      setManualResult("");
      setManualSourceModel("");
      setManualNotice("붙여넣은 분석 결과로 리포트를 업데이트했습니다.");
      applyRun(body.run ?? null);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "수동 분석 결과를 저장하지 못했습니다."); }
    finally { setManualImporting(false); }
  }

  const running = run?.status === "running";
  const disabled = !migrationReady || !hasData || loadingPreview || starting || running;
  const manualPromptDisabled = !hasData || manualPromptLoading || running;
  const manualImportDisabled = !migrationReady || running || manualImporting;
  const status = running ? (run.stage === "saving" ? "분석 결과를 저장하는 중입니다. 페이지를 나가도 계속됩니다…" : `${run.model}이 종합분석 리포트를 작성 중입니다. 페이지를 나가도 계속됩니다…`) : run?.status === "failed" ? `최근 분석 실패: ${run.error ?? "알 수 없는 오류"}` : error;

  return <>
    <section className="analysis-action-card">
      <div><p className="kicker">ON-DEMAND ANALYSIS</p><h2>현재 저장 데이터 종합분석</h2><p>OpenAI API로 바로 분석하거나, 프롬프트를 복사해 구독 중인 AI에서 직접 분석한 결과를 다시 저장할 수 있습니다.</p></div>
      <div className="analysis-action"><label htmlFor="comprehensive-model">OPENAI API MODEL</label><select id="comprehensive-model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value as OpenAIComprehensiveModel)} disabled={running || loadingPreview || starting}>{OPENAI_COMPREHENSIVE_MODELS.map((model) => <option value={model} key={model}>{model} · {MODEL_DESCRIPTIONS[model]}</option>)}</select><small>{MODEL_DESCRIPTIONS[selectedModel]} · reasoning medium</small><button className="combined-button" type="button" onClick={() => void requestPreview()} disabled={disabled}>{loadingPreview ? "토큰 계산 중…" : running ? "분석 진행 중" : "API로 분석"}</button><div className="analysis-manual-actions"><span>구독 중인 AI 직접 사용 · API 비용 없음</span><div><button className="secondary-button" type="button" onClick={() => void requestManualPrompt()} disabled={manualPromptDisabled}>{manualPromptLoading ? "생성 중…" : "프롬프트 복사"}</button><button className="secondary-button" type="button" onClick={() => { setError(""); setManualResultOpen(true); }} disabled={manualImportDisabled}>결과 입력</button></div></div>{status ? <p className={run?.status === "failed" || error ? "error" : ""} role="status">{status}</p> : manualNotice ? <p role="status">{manualNotice}</p> : null}</div>
    </section>

    {!migrationReady ? <aside className="setup-alert"><div><span className="alert-dot" /><strong>종합분석 저장 설정이 필요합니다</strong></div><p>Supabase SQL Editor에서 <code>202607220011_comprehensive_analysis.sql</code>을 실행하세요.</p></aside> : null}

    {initialReport ? <ComprehensiveReport stored={initialReport} currentSnapshotId={currentSnapshotId} /> : <section className="empty-state analysis-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO REPORT YET</p><h2>아직 저장된 종합분석이 없습니다.</h2><p>API로 분석하거나 프롬프트를 복사해 외부 AI 결과를 저장할 수 있습니다.</p></section>}

    {preview ? <div className="analysis-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) setPreview(null); }}><section className="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-confirm-title"><p className="kicker">COST CONFIRMATION</p><h2 id="analysis-confirm-title">종합분석을 실행할까요?</h2><p>현재 저장 데이터를 직렬화한 <b>예상 입력 토큰</b>입니다. 실제 사용량과 요금은 모델 토크나이저 및 reasoning·응답 길이에 따라 달라집니다.</p><div className="analysis-token-count"><span>약</span><strong>{number(preview.estimatedInputTokens)}</strong><small>입력 tokens</small></div><dl><div><dt>모델</dt><dd>{preview.model} · reasoning medium</dd></div><div><dt>포함 데이터</dt><dd>매크로 {preview.dataCounts.macro}개 · 시장 {preview.dataCounts.market}개 · 게시물 {preview.dataCounts.posts}개</dd></div><div><dt>출력 상한</dt><dd>reasoning 포함 최대 {number(preview.maxOutputTokens)} tokens</dd></div></dl><aside>확인을 누를 때만 OpenAI 유료 호출이 시작됩니다. 작업 중 페이지를 나가도 계속 진행되며 자동 재호출은 하지 않습니다.</aside><div className="analysis-modal-actions"><button className="secondary-button" type="button" onClick={() => setPreview(null)} disabled={starting}>취소</button><button className="combined-button" type="button" onClick={() => void startAnalysis()} disabled={starting}>{starting ? "시작 중…" : "확인 후 분석 시작"}</button></div></section></div> : null}

    {manualPrompt ? <div className="analysis-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualPrompt(null); }}><section className="analysis-modal analysis-manual-modal" role="dialog" aria-modal="true" aria-labelledby="manual-prompt-title"><p className="kicker">MANUAL AI PROMPT</p><h2 id="manual-prompt-title">구독 중인 AI에 입력하세요</h2><p>아래 프롬프트에는 현재 저장된 대시보드 데이터와 출력 형식이 모두 포함돼 있습니다. AI가 돌려준 JSON 결과 전체를 복사하세요.</p><div className="analysis-token-count compact"><span>예상 입력</span><strong>{number(manualPrompt.estimatedInputTokens)}</strong><small>tokens</small></div><label htmlFor="manual-analysis-prompt">종합분석 프롬프트</label><textarea id="manual-analysis-prompt" readOnly value={manualPrompt.prompt} />{error ? <p className="analysis-modal-error" role="alert">{error}</p> : null}<aside>프롬프트 안의 <code>source_snapshot_id</code>를 변경하지 마세요. 이 값으로 분석 결과와 원본 데이터를 정확히 연결합니다.</aside><div className="analysis-modal-actions"><button className="secondary-button" type="button" onClick={() => setManualPrompt(null)}>닫기</button><button className="combined-button" type="button" onClick={() => void copyManualPrompt()}>프롬프트 다시 복사</button></div></section></div> : null}

    {manualResultOpen ? <div className="analysis-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !manualImporting) { setError(""); setManualResultOpen(false); } }}><section className="analysis-modal analysis-manual-modal" role="dialog" aria-modal="true" aria-labelledby="manual-result-title"><p className="kicker">IMPORT AI RESULT</p><h2 id="manual-result-title">분석 결과 입력</h2><p>AI가 반환한 JSON 전체를 붙여넣으면 형식을 검사한 뒤 기존 종합분석 리포트를 업데이트합니다.</p><label htmlFor="manual-source-model">사용한 AI 또는 모델</label><input id="manual-source-model" type="text" maxLength={70} value={manualSourceModel} onChange={(event) => setManualSourceModel(event.target.value)} placeholder="예: ChatGPT GPT-5.6 Sol" /><label htmlFor="manual-analysis-result">AI 분석 결과</label><textarea id="manual-analysis-result" value={manualResult} onChange={(event) => setManualResult(event.target.value)} placeholder="{ &quot;source_snapshot_id&quot;: &quot;...&quot;, &quot;report&quot;: { ... } }" />{error ? <p className="analysis-modal-error" role="alert">{error}</p> : null}<aside>이 저장 과정에서는 LLM API를 호출하지 않습니다. JSON 형식과 필수 항목이 맞지 않으면 저장하지 않고 오류 내용을 보여줍니다.</aside><div className="analysis-modal-actions"><button className="secondary-button" type="button" onClick={() => { setError(""); setManualResultOpen(false); }} disabled={manualImporting}>취소</button><button className="combined-button" type="button" onClick={() => void importManualResult()} disabled={manualImporting || !manualResult.trim()}>{manualImporting ? "검사·저장 중…" : "결과로 리포트 업데이트"}</button></div></section></div> : null}
  </>;
}
