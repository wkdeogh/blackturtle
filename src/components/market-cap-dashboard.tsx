"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "@/lib/toast";
import type { CompanyFinancialPeriod, CompanyProfileDetail, CompanyProfileRefreshRun, CompanyProfileSummary, MarketCapitalizationItem, MarketCapitalizationSnapshot } from "@/lib/types";

interface ProfilePreview {
  model: string;
  totalCompanies: number;
  candidateCount: number;
  skippedCount: number;
  newCount: number;
  staleCount: number;
  estimatedInputTokens: number;
}

interface ProfileApiResponse {
  migrationReady?: boolean;
  summaries?: CompanyProfileSummary[];
  profile?: CompanyProfileDetail | null;
  run?: CompanyProfileRefreshRun | null;
  error?: string;
}

function compactDollar(value: number): string {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 1 : 2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(value >= 100_000_000_000 ? 0 : 1)}B`;
  return `$${(value / 1_000_000).toFixed(0)}M`;
}

function fullDollar(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function financialValue(value: number | null, currency: string): string {
  if (value === null) return "-";
  const absolute = Math.abs(value);
  const unit = absolute >= 1_000_000_000_000 ? "T" : absolute >= 1_000_000_000 ? "B" : absolute >= 1_000_000 ? "M" : "";
  const divisor = unit === "T" ? 1_000_000_000_000 : unit === "B" ? 1_000_000_000 : unit === "M" ? 1_000_000 : 1;
  const amount = (absolute / divisor).toFixed(1).replace(/\.0$/, "");
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return `${value < 0 ? "-" : ""}${prefix}${amount}${unit}`;
}

function percent(value: number | null): string {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function number(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function rankMovement(item: MarketCapitalizationItem) {
  if (item.previousRank === null) return <span className="rank-move new">NEW</span>;
  if (!item.rankChange) return <span className="rank-move flat">—</span>;
  return <span className={`rank-move ${item.rankChange > 0 ? "up" : "down"}`}>{item.rankChange > 0 ? "▲" : "▼"}{Math.abs(item.rankChange)}</span>;
}

function ageLabel(value: string | null): { days: number | null; label: string } {
  if (!value) return { days: null, label: "아직 없음" };
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return { days: null, label: value };
  const days = Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  return { days, label: days === 0 ? "오늘" : `${days}일 전` };
}

function runMessage(run: CompanyProfileRefreshRun | null) {
  if (!run) return "아직 기업 분석 작업을 실행하지 않았습니다.";
  if (run.status === "running") {
    const stage = run.stage === "financials" ? "SEC 재무 확인" : run.stage === "analyzing" ? "기업 분석" : run.stage === "saving" ? "결과 저장" : "작업 준비";
    return `${stage} · ${run.completedCount + run.failedCount}/${run.totalCount} 처리 · 페이지를 나가도 계속 진행됩니다.`;
  }
  if (run.status === "partial") return `최근 작업 일부 완료 · 성공 ${run.completedCount} · 실패 ${run.failedCount}`;
  if (run.status === "failed") return `최근 작업 실패 · ${run.error ?? "알 수 없는 오류"}`;
  return `최근 작업 완료 · ${run.completedCount}개 기업 분석`;
}

function FinancialRows({ rows, currency }: { rows: CompanyFinancialPeriod[]; currency: string }) {
  if (!rows.length) return <div className="company-profile-inline-empty">해당 기간의 SEC 표준 재무 수치를 찾지 못했습니다.</div>;
  return <div className="company-financial-table"><div className="company-financial-head"><span>기간</span><span>매출</span><span>영업이익</span><span>영업이익률</span></div>{rows.map((row) => <div className="company-financial-row" key={`${row.periodEnd}-${row.form}-${row.accession}`}><span><b>{row.periodEnd}</b><small>{row.form}{row.derived ? " · 계산값" : ""}</small></span><strong>{financialValue(row.revenue, currency)}</strong><strong>{financialValue(row.operatingIncome, currency)}</strong><strong>{row.operatingMarginPercent === null ? "-" : `${row.operatingMarginPercent.toFixed(1)}%`}</strong></div>)}</div>;
}

export function MarketCapDashboard({
  snapshot,
  initialProfileSummaries,
  initialProfileRun,
  profileMigrationReady,
}: {
  snapshot: MarketCapitalizationSnapshot;
  initialProfileSummaries: CompanyProfileSummary[];
  initialProfileRun: CompanyProfileRefreshRun | null;
  profileMigrationReady: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [visibleCount, setVisibleCount] = useState(50);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [summaries, setSummaries] = useState(initialProfileSummaries);
  const [profileRun, setProfileRun] = useState(initialProfileRun);
  const [preview, setPreview] = useState<ProfilePreview | null>(null);
  const [profileAction, setProfileAction] = useState<"idle" | "preview" | "starting">("idle");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CompanyProfileDetail | null>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const previousRunRef = useRef(profileRun);
  const ranked = snapshot.items.slice(0, 200);
  const sectors = useMemo(() => [...new Set(snapshot.items.map((item) => item.sector))].sort((a, b) => a.localeCompare(b, "ko")), [snapshot.items]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => ranked.filter((item) => {
    const matchesQuery = !normalizedQuery || item.symbol.toLowerCase().includes(normalizedQuery) || item.name.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (sector === "all" || item.sector === sector);
  }), [normalizedQuery, ranked, sector]);
  const rows = filtered.slice(0, normalizedQuery || sector !== "all" ? filtered.length : visibleCount);
  const totalMarketCap = ranked.reduce((sum, item) => sum + item.marketCap, 0);
  const topTenMarketCap = ranked.slice(0, 10).reduce((sum, item) => sum + item.marketCap, 0);
  const sectorTotals = (() => {
    const totals = new Map<string, number>();
    for (const item of ranked) totals.set(item.sector, (totals.get(item.sector) ?? 0) + item.marketCap);
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  })();
  const largest = sectorTotals[0];
  const maximum = ranked[0]?.marketCap ?? 1;
  const summaryByTicker = new Map(summaries.map((summary) => [summary.ticker, summary]));
  const profileReadyCount = ranked.filter((company) => summaryByTicker.get(company.symbol)?.profileAnalyzedAt).length;
  const financialReadyCount = ranked.filter((company) => summaryByTicker.get(company.symbol)?.financialUpdatedAt).length;
  const selectedCompany = ranked.find((company) => company.symbol === selectedTicker) ?? null;
  const selectedProfile = selectedTicker ? details[selectedTicker] : null;
  const running = profileRun?.status === "running";

  const fetchProfile = useCallback(async (ticker: string) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const response = await fetch(`/api/company-profiles?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const body = (await response.json()) as ProfileApiResponse;
      if (!response.ok) throw new Error(body.error ?? "기업 정보를 불러오지 못했습니다.");
      setProfileRun(body.run ?? null);
      setDetails((current) => ({ ...current, [ticker]: body.profile ?? null }));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "기업 정보를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function refreshProfileState() {
    const response = await fetch("/api/company-profiles", { cache: "no-store" });
    const body = (await response.json()) as ProfileApiResponse;
    if (!response.ok) throw new Error(body.error ?? "기업 분석 상태를 확인하지 못했습니다.");
    if (body.summaries) setSummaries(body.summaries);
    setProfileRun(body.run ?? null);
    return body.run ?? null;
  }

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { void refreshProfileState().catch(() => undefined); }, 3_000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const previous = previousRunRef.current;
    let refreshTimer: number | undefined;
    if (previous?.status === "running" && profileRun?.id === previous.id && profileRun.status !== "running") {
      if (profileRun.status === "success") showToast(`기업 정보 ${profileRun.completedCount}개 갱신을 완료했습니다.`);
      else if (profileRun.status === "partial") showToast(`기업 정보 일부 완료 · 실패 ${profileRun.failedCount}개`, "info");
      else showToast(profileRun.error ?? "기업 정보 갱신에 실패했습니다.", "error");
      refreshTimer = window.setTimeout(() => {
        setDetails({});
        if (selectedTicker) void fetchProfile(selectedTicker);
      }, 0);
    }
    previousRunRef.current = profileRun;
    return () => { if (refreshTimer) window.clearTimeout(refreshTimer); };
  }, [profileRun, selectedTicker, fetchProfile]);

  useEffect(() => {
    if (!selectedTicker && !preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || profileAction === "starting") return;
      if (preview) setPreview(null);
      else setSelectedTicker(null);
    };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [selectedTicker, preview, profileAction]);

  async function copyVisibleTickers() {
    if (!rows.length) return;
    const tickers = rows.map((item) => item.symbol).join(", ");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tickers);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = tickers;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("clipboard copy failed");
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2400);
    }
  }

  async function loadProfile(ticker: string, force = false) {
    setSelectedTicker(ticker);
    setDetailError("");
    if (!force && Object.prototype.hasOwnProperty.call(details, ticker)) return;
    await fetchProfile(ticker);
  }

  async function requestBulkPreview() {
    if (!profileMigrationReady || running || profileAction !== "idle") return;
    setProfileAction("preview");
    try {
      const response = await fetch("/api/company-profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", mode: "bulk" }) });
      const body = (await response.json()) as ProfilePreview & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "기업 분석 대상을 확인하지 못했습니다.");
      if (!body.candidateCount) {
        showToast("TOP200 기업 분석이 모두 60일 이내 최신 상태입니다.", "info");
        return;
      }
      setPreview(body);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "기업 분석 대상을 확인하지 못했습니다.", "error");
    } finally {
      setProfileAction("idle");
    }
  }

  async function startProfileRefresh(mode: "bulk" | "single", ticker?: string) {
    if (running || profileAction === "starting") return;
    setProfileAction("starting");
    try {
      const response = await fetch("/api/company-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", mode, ticker, expectedCount: mode === "bulk" ? preview?.candidateCount : undefined }),
        keepalive: true,
      });
      const body = (await response.json()) as ProfileApiResponse;
      if (!response.ok) throw new Error(body.error ?? "기업 정보 갱신을 시작하지 못했습니다.");
      setProfileRun(body.run ?? null);
      setPreview(null);
      showToast(mode === "bulk" ? "TOP200 기업 정보 갱신을 시작했습니다." : `${ticker} 기업 정보 갱신을 시작했습니다.`, "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "기업 정보 갱신을 시작하지 못했습니다.", "error");
    } finally {
      setProfileAction("idle");
    }
  }

  return <>
    <section className="market-cap-summary" aria-label="시가총액 상위 200개 요약">
      <article><span>TOP 200 합산</span><strong>{compactDollar(totalMarketCap)}</strong><small>중복 주식 종류는 기업 단위로 정리</small></article>
      <article><span>상위 10 집중도</span><strong>{totalMarketCap ? `${((topTenMarketCap / totalMarketCap) * 100).toFixed(1)}%` : "-"}</strong><small>TOP 200 합산 시총 중 비중</small></article>
      <article><span>최대 섹터</span><strong>{largest?.[0] ?? "-"}</strong><small>{largest && totalMarketCap ? `${((largest[1] / totalMarketCap) * 100).toFixed(1)}%` : "분류 데이터 없음"}</small></article>
    </section>

    <section className={`company-profile-sync ${running ? "running" : ""}`} aria-live="polite">
      <div><p className="kicker">COMPANY RESEARCH CACHE</p><h2>기업 상세 정보</h2><p>{runMessage(profileRun)}</p></div>
      <dl><div><dt>기업 분석</dt><dd>{profileReadyCount}/200</dd></div><div><dt>SEC 재무</dt><dd>{financialReadyCount}/200</dd></div>{running ? <div><dt>진행률</dt><dd>{profileRun.completedCount + profileRun.failedCount}/{profileRun.totalCount}</dd></div> : null}</dl>
      <button type="button" className="combined-button" onClick={() => void requestBulkPreview()} disabled={!profileMigrationReady || running || profileAction !== "idle"}>{profileAction === "preview" ? "대상 확인 중…" : running ? "전체 갱신 중" : "기업 정보 전체 갱신"}</button>
    </section>

    <section className="market-cap-board">
      <header className="market-cap-tools">
        <label className="market-cap-search"><span className="sr-only">종목 검색</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }} placeholder="티커 또는 기업명 검색" autoComplete="off" /><i aria-hidden="true">⌕</i></label>
        <label className="market-cap-sector"><span className="sr-only">섹터 선택</span><select value={sector} onChange={(event) => { setSector(event.target.value); setVisibleCount(50); }}><option value="all">전체 섹터</option>{sectors.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <button type="button" className="market-cap-copy" onClick={copyVisibleTickers} disabled={!rows.length} title={rows.length ? `현재 표시된 ${rows.length}개 티커 복사` : "복사할 티커가 없습니다."} aria-label={rows.length ? `현재 표시된 ${rows.length}개 티커 복사` : "복사할 티커가 없습니다."}>{copyState === "copied" ? "복사됨" : copyState === "error" ? "복사 실패" : "티커 복사"}</button>
      </header>

      <div className="market-cap-table-head" aria-hidden="true"><span>순위</span><span>기업</span><span>섹터</span><span>주가 / 일간</span><span>시가총액</span></div>
      {rows.length ? <ol className="market-cap-list">{rows.map((item) => <li key={item.symbol}>
        <button type="button" className="market-cap-row" onClick={() => void loadProfile(item.symbol)} aria-label={`${item.rank}위 ${item.name} 기업 상세 보기`}>
          <div className="market-cap-rank"><strong>{item.rank}</strong>{rankMovement(item)}</div>
          <div className="market-cap-company"><strong>{item.symbol}</strong><span>{item.name}</span><small>{item.industry || item.country || "산업 분류 없음"}</small></div>
          <span className="market-cap-sector-name">{item.sector}</span>
          <div className="market-cap-price"><strong>{item.lastPrice === null ? "-" : `$${item.lastPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}`}</strong><span className={(item.dayChangePercent ?? 0) > 0 ? "up" : (item.dayChangePercent ?? 0) < 0 ? "down" : "flat"}>{percent(item.dayChangePercent)}</span></div>
          <div className="market-cap-value"><strong title={fullDollar(item.marketCap)}>{compactDollar(item.marketCap)}</strong><span className={(item.marketCapChangePercent ?? 0) > 0 ? "up" : (item.marketCapChangePercent ?? 0) < 0 ? "down" : "flat"}>{item.marketCapChangePercent === null ? "첫 저장" : `이전 갱신 ${percent(item.marketCapChangePercent)}`}</span><i style={{ width: `${Math.max(5, (item.marketCap / maximum) * 100)}%` }} /></div>
          <b className="market-cap-link" aria-hidden="true">＋</b>
        </button>
      </li>)}</ol> : <div className="inline-empty">검색 조건에 맞는 기업이 없습니다.</div>}
      {rows.length < filtered.length ? <div className="market-cap-more"><span>{rows.length}/{filtered.length}개 표시</span><button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 50, filtered.length))}>50개 더 보기</button></div> : null}
    </section>

    <p className="market-cap-source-note">시가총액은 Nasdaq Screener의 최근 주가와 발행주식수 기반 값입니다. 기업 재무는 SEC Company Facts, 기업 설명은 표시된 SEC 공시를 근거로 저장합니다.</p>

    {preview ? <div className="company-profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && profileAction !== "starting") setPreview(null); }}><section className="company-profile-confirm" role="dialog" aria-modal="true" aria-labelledby="company-profile-confirm-title"><p className="kicker">COST CONFIRMATION</p><h2 id="company-profile-confirm-title">기업 정보를 전체 갱신할까요?</h2><p>TOP200 중 분석이 없거나 마지막 분석 후 60일이 지난 기업만 OpenAI API로 처리합니다.</p><div className="company-profile-confirm-count"><strong>{preview.candidateCount}</strong><span>개 기업 분석 예정</span></div><dl><div><dt>신규</dt><dd>{preview.newCount}개</dd></div><div><dt>60일 경과</dt><dd>{preview.staleCount}개</dd></div><div><dt>최신 상태 제외</dt><dd>{preview.skippedCount}개</dd></div><div><dt>모델</dt><dd>{preview.model}</dd></div><div><dt>예상 입력</dt><dd>약 {number(preview.estimatedInputTokens)} tokens</dd></div></dl><aside>SEC 재무 확인은 무료이며, 위 기업 설명 분석에만 OpenAI API 요금이 발생합니다. 작업 중 페이지를 나가도 계속됩니다.</aside><div><button type="button" className="secondary-button" onClick={() => setPreview(null)} disabled={profileAction === "starting"}>취소</button><button type="button" className="combined-button" onClick={() => void startProfileRefresh("bulk")} disabled={profileAction === "starting"}>{profileAction === "starting" ? "시작 중…" : "확인 후 전체 갱신"}</button></div></section></div> : null}

    {selectedCompany ? <div className="company-profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTicker(null); }}><section className="company-profile-modal" role="dialog" aria-modal="true" aria-labelledby="company-profile-title"><header><div><p className="kicker">COMPANY PROFILE · #{selectedCompany.rank}</p><h2 id="company-profile-title"><span>{selectedCompany.symbol}</span>{selectedCompany.name}</h2><p>{selectedCompany.sector}{selectedCompany.industry ? ` · ${selectedCompany.industry}` : ""}</p></div><button type="button" onClick={() => setSelectedTicker(null)} aria-label="기업 상세 닫기">×</button></header>
      {detailLoading && !selectedProfile ? <div className="company-profile-loading" aria-busy="true"><i /><i /><i /></div> : detailError ? <div className="company-profile-error"><strong>기업 정보를 불러오지 못했습니다.</strong><p>{detailError}</p><button type="button" className="secondary-button" onClick={() => void loadProfile(selectedCompany.symbol, true)}>다시 불러오기</button></div> : <>
        <div className="company-profile-status-row"><span className={(ageLabel(selectedProfile?.profileAnalyzedAt ?? null).days ?? 999) >= 60 ? "stale" : "fresh"}>기업 분석 {ageLabel(selectedProfile?.profileAnalyzedAt ?? null).label}</span><span>재무 확인 {ageLabel(selectedProfile?.financialCheckedAt ?? null).label}</span>{selectedProfile?.financialFilingForm ? <span>{selectedProfile.financialFilingForm} · {selectedProfile.financialFilingDate}</span> : null}</div>
        <section className="company-profile-overview"><div className="company-profile-section-head"><div><p className="kicker">01 · OVERVIEW</p><h3>어떤 기업인가</h3></div><button type="button" className="secondary-button" onClick={() => void startProfileRefresh("single", selectedCompany.symbol)} disabled={!profileMigrationReady || running || profileAction !== "idle"}>{!profileMigrationReady ? "migration 필요" : running && profileRun?.requestedTicker === selectedCompany.symbol ? "갱신 중…" : "이 기업 갱신"}</button></div>{selectedProfile?.narrative?.overview ? <p>{selectedProfile.narrative.overview}</p> : <div className="company-profile-inline-empty">{profileMigrationReady ? "아직 저장된 기업 분석이 없습니다. 이 기업 갱신 버튼을 누르면 최신 SEC 공시를 바탕으로 분석합니다." : "기업 정보 migration을 적용하면 재무·기업 분석을 저장할 수 있습니다."}</div>}{selectedProfile?.profileError ? <small className="company-profile-warning">최근 분석 오류: {selectedProfile.profileError}</small> : null}</section>
        <section><div className="company-profile-section-head"><div><p className="kicker">02 · FINANCIALS</p><h3>연간·분기 실적</h3></div>{selectedProfile?.financialSourceUrl ? <a href={selectedProfile.financialSourceUrl} target="_blank" rel="noreferrer">SEC Company Facts ↗</a> : null}</div><div className="company-financial-groups"><article><h4>연간</h4><FinancialRows rows={selectedProfile?.financial?.annual ?? []} currency={selectedProfile?.financial?.currency ?? "USD"} /></article><article><h4>분기</h4><FinancialRows rows={selectedProfile?.financial?.quarterly ?? []} currency={selectedProfile?.financial?.currency ?? "USD"} /></article></div></section>
        <section className="company-profile-two-column"><article><p className="kicker">03 · REVENUE ITEMS</p><h3>주요 매출 아이템</h3>{selectedProfile?.narrative?.revenueItems?.length ? <ul>{selectedProfile.narrative.revenueItems.map((item) => <li key={item.title}><strong>{item.title}</strong><p>{item.description}</p></li>)}</ul> : <div className="company-profile-inline-empty">기업 분석 후 표시됩니다.</div>}</article><article><p className="kicker">04 · GROWTH &amp; R&amp;D</p><h3>성장·연구개발 방향</h3>{selectedProfile?.narrative?.growthAndResearch?.length ? <ul>{selectedProfile.narrative.growthAndResearch.map((item) => <li key={item.title}><strong>{item.title}</strong><p>{item.description}</p></li>)}</ul> : <div className="company-profile-inline-empty">기업 분석 후 표시됩니다.</div>}</article></section>
        <footer><div><span>기업 분석 {selectedProfile?.profileModel ?? "아직 없음"}</span>{selectedProfile?.profileSourceUrl ? <a href={selectedProfile.profileSourceUrl} target="_blank" rel="noreferrer">분석 근거 공시 ↗</a> : null}</div><a href={selectedCompany.sourceUrl} target="_blank" rel="noreferrer">Nasdaq 종목 페이지 ↗</a></footer>
      </>}
    </section></div> : null}
  </>;
}
