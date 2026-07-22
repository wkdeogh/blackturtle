"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import type { ComprehensiveAnalysisRunStatus, StoredComprehensiveAnalysis } from "@/lib/types";

interface Preview {
  snapshotId: string;
  model: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  dataCounts: { macro: number; market: number; posts: number };
}

function number(value: number): string { return new Intl.NumberFormat("ko-KR").format(value); }

function ReportList({ items }: { items: string[] }) {
  return items.length ? <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="analysis-none">근거가 충분하지 않습니다.</p>;
}

function ComprehensiveReport({ stored, currentSnapshotId }: { stored: StoredComprehensiveAnalysis; currentSnapshotId: string | null }) {
  const report = stored.report;
  const stale = Boolean(currentSnapshotId && report.sourceSnapshotId !== currentSnapshotId);
  return <article className="analysis-report">
    {stale ? <aside className="analysis-stale">이 리포트 작성 후 대시보드 데이터가 갱신됐습니다. 새 데이터 반영이 필요하면 다시 분석하세요.</aside> : null}
    <header className="analysis-report-head">
      <div><p className="kicker">COMPREHENSIVE REPORT</p><h2>{report.headline}</h2><p>{report.executiveSummary}</p></div>
      <dl><div><dt>작성</dt><dd>{formatDateTime(report.generatedAt)}</dd></div><div><dt>모델</dt><dd>{report.model}</dd></div><div><dt>예상 입력</dt><dd>약 {number(report.estimatedInputTokens)} tokens</dd></div></dl>
    </header>

    <section className="analysis-regime"><span>시장 국면</span><h3>{report.marketRegime.label}</h3><p>{report.marketRegime.summary}</p><ReportList items={report.marketRegime.evidence} /></section>

    <section className="analysis-section">
      <div className="section-title"><div><p className="kicker">01 · KEY INSIGHTS</p><h2>핵심 인사이트</h2></div><p>중요도순 · 관찰과 추론 분리</p></div>
      <div className="analysis-insight-list">{report.keyInsights.map((insight, index) => <article key={`${index}-${insight.title}`}>
        <div className="analysis-card-number">{String(index + 1).padStart(2, "0")}</div><div><div className="analysis-card-title"><h3>{insight.title}</h3><span>{insight.confidence} 확신</span></div><p>{insight.analysis}</p><ReportList items={insight.evidence} /><aside><b>투자자 관점</b>{insight.investorImplication}</aside></div>
      </article>)}</div>
    </section>

    <section className="analysis-section analysis-two-column">
      <div><div className="section-title"><div><p className="kicker">02 · OPPORTUNITIES</p><h2>기회 요인</h2></div></div><div className="analysis-stack">{report.opportunities.map((item) => <article className="analysis-simple-card positive" key={item.title}><h3>{item.title}</h3><p>{item.rationale}</p><b>성립 조건</b><ReportList items={item.conditions} /><b>반대 위험</b><ReportList items={item.risks} /><small>{item.relatedAssets.join(" · ")}</small></article>)}</div></div>
      <div><div className="section-title"><div><p className="kicker">03 · RISKS</p><h2>위험 요인</h2></div></div><div className="analysis-stack">{report.risks.map((item) => <article className="analysis-simple-card negative" key={item.title}><h3>{item.title}</h3><p>{item.transmission}</p><b>확인 신호</b><ReportList items={item.watchSignals} /><small>{item.relatedAssets.join(" · ")}</small></article>)}</div></div>
    </section>

    <section className="analysis-section"><div className="section-title"><div><p className="kicker">04 · SCENARIOS</p><h2>조건별 시나리오</h2></div><p>확률 예측이 아닌 확인 조건</p></div><div className="analysis-scenarios">{report.scenarios.map((scenario) => <article key={scenario.name}><span>{scenario.name}</span><ReportList items={scenario.conditions} /><p><b>예상 영향</b>{scenario.marketImpact}</p><p><b>대응 관점</b>{scenario.response}</p></article>)}</div></section>

    <section className="analysis-section"><div className="section-title"><div><p className="kicker">05 · WATCHLIST</p><h2>다음 확인 항목</h2></div></div><div className="analysis-watchlist">{report.watchlist.map((item, index) => <article key={`${index}-${item.item}`}><span>{index + 1}</span><div><h3>{item.item}</h3><p>{item.currentContext}</p><small>{item.whyItMatters}</small><b>확인 기준 · {item.trigger}</b></div></article>)}</div></section>

    <section className="analysis-bottom-line"><p className="kicker">BOTTOM LINE</p><h2>{report.bottomLine}</h2>{report.dataCaveats.length ? <details><summary>데이터 한계 {report.dataCaveats.length}건</summary><ReportList items={report.dataCaveats} /></details> : null}<small>대시보드에 저장된 데이터만 사용한 AI 분석이며 투자 조언이 아닙니다.</small></section>
  </article>;
}

export function ComprehensiveAnalysisPanel({ initialRun, initialReport, currentSnapshotId, migrationReady, hasData }: {
  initialRun: ComprehensiveAnalysisRunStatus | null;
  initialReport: StoredComprehensiveAnalysis | null;
  currentSnapshotId: string | null;
  migrationReady: boolean;
  hasData: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [preview, setPreview] = useState<Preview | null>(null);
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
      const response = await fetch("/api/comprehensive-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview" }) });
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
      const response = await fetch("/api/comprehensive-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", snapshotId: preview.snapshotId }), keepalive: true });
      const body = (await response.json()) as { run?: ComprehensiveAnalysisRunStatus | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "종합분석을 시작하지 못했습니다.");
      setPreview(null);
      applyRun(body.run ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "종합분석을 시작하지 못했습니다."); }
    finally { setStarting(false); }
  }

  const running = run?.status === "running";
  const disabled = !migrationReady || !hasData || loadingPreview || starting || running;
  const status = running ? (run.stage === "saving" ? "분석 결과를 저장하는 중입니다. 페이지를 나가도 계속됩니다…" : "GPT 고급모델이 종합분석 리포트를 작성 중입니다. 페이지를 나가도 계속됩니다…") : run?.status === "failed" ? `최근 분석 실패: ${run.error ?? "알 수 없는 오류"}` : error;

  return <>
    <section className="analysis-action-card">
      <div><p className="kicker">ON-DEMAND ANALYSIS</p><h2>현재 저장 데이터 종합분석</h2><p>매크로 시계열, 시장지수와 ETF 가격, X 게시물·기업 언급·주제 결과를 하나의 프롬프트로 분석합니다. 버튼을 누르기 전에는 비용이 발생하지 않습니다.</p></div>
      <div className="analysis-action"><span>MODEL</span><strong>GPT 고급모델</strong><button className="combined-button" type="button" onClick={() => void requestPreview()} disabled={disabled}>{loadingPreview ? "토큰 계산 중…" : running ? "분석 진행 중" : "분석하기"}</button>{status ? <p className={run?.status === "failed" || error ? "error" : ""} role="status">{status}</p> : null}</div>
    </section>

    {!migrationReady ? <aside className="setup-alert"><div><span className="alert-dot" /><strong>종합분석 저장 설정이 필요합니다</strong></div><p>Supabase SQL Editor에서 <code>202607220011_comprehensive_analysis.sql</code>을 실행하세요.</p></aside> : null}

    {initialReport ? <ComprehensiveReport stored={initialReport} currentSnapshotId={currentSnapshotId} /> : <section className="empty-state analysis-empty"><div className="empty-orbit"><span>0</span></div><p className="kicker">NO REPORT YET</p><h2>아직 저장된 종합분석이 없습니다.</h2><p>데이터를 갱신한 뒤 분석하기를 누르면 예상 토큰을 먼저 확인할 수 있습니다.</p></section>}

    {preview ? <div className="analysis-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) setPreview(null); }}><section className="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-confirm-title"><p className="kicker">COST CONFIRMATION</p><h2 id="analysis-confirm-title">종합분석을 실행할까요?</h2><p>현재 저장 데이터를 직렬화한 <b>예상 입력 토큰</b>입니다. 실제 사용량과 요금은 모델 토크나이저 및 reasoning·응답 길이에 따라 달라집니다.</p><div className="analysis-token-count"><span>약</span><strong>{number(preview.estimatedInputTokens)}</strong><small>입력 tokens</small></div><dl><div><dt>모델</dt><dd>{preview.model} · reasoning medium</dd></div><div><dt>포함 데이터</dt><dd>매크로 {preview.dataCounts.macro}개 · 시장 {preview.dataCounts.market}개 · 게시물 {preview.dataCounts.posts}개</dd></div><div><dt>출력 상한</dt><dd>reasoning 포함 최대 {number(preview.maxOutputTokens)} tokens</dd></div></dl><aside>확인을 누를 때만 OpenAI 유료 호출이 시작됩니다. 작업 중 페이지를 나가도 계속 진행되며 자동 재호출은 하지 않습니다.</aside><div className="analysis-modal-actions"><button className="secondary-button" type="button" onClick={() => setPreview(null)} disabled={starting}>취소</button><button className="combined-button" type="button" onClick={() => void startAnalysis()} disabled={starting}>{starting ? "시작 중…" : "확인 후 분석 시작"}</button></div></section></div> : null}
  </>;
}
