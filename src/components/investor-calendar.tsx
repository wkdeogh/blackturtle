"use client";

import Link from "next/link";
import { useState } from "react";
import { calendarDayDistance, withinCalendarWindow } from "@/lib/investor-view";
import type { EconomicCalendarEvent, EarningsCalendarEvent } from "@/lib/types";

const CATEGORIES = { all: "전체", inflation: "물가", employment: "고용", growth: "성장", fed: "연준", other: "기타" } as const;

function EventDate({ date, today }: { date: string; today: string }) {
  const days = calendarDayDistance(today, date);
  return <time dateTime={date}>{date.slice(5).replace("-", ".")}<small>{days === 0 ? "오늘" : days === 1 ? "내일" : `D-${days}`}</small></time>;
}

export function InvestorCalendar({ economicEvents, earningsEvents, today }: { economicEvents: EconomicCalendarEvent[]; earningsEvents: EarningsCalendarEvent[]; today: string }) {
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState<keyof typeof CATEGORIES>("all");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const events = economicEvents.filter((event) => withinCalendarWindow(event.date, today, days) && (category === "all" || event.category === category)).sort((a, b) => a.date.localeCompare(b.date));
  const earnings = earningsEvents.filter((event) => withinCalendarWindow(event.reportDate, today, days) && `${event.ticker} ${event.companyName ?? ""}`.toLowerCase().includes(term)).sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  return <section className="section-block" aria-labelledby="investor-calendar-title">
    <div className="section-title"><div><p className="kicker">UPCOMING CATALYSTS</p><h2 id="investor-calendar-title">경제·실적 일정</h2></div><p>미국 동부 날짜 기준 · 오늘 {today}</p></div>
    <div className="investor-toolbar"><div className="investor-segments" role="group" aria-label="일정 기간">{[7, 14, 30].map((value) => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value}일</button>)}</div><span className="investor-help" role="status">경제 {events.length}건 · 실적 {earnings.length}건</span></div>
    <div className="calendar-columns">
      <article className="calendar-card"><header><h3>미국 주요 경제 발표</h3><span>FRED</span></header>
        <label className="investor-select calendar-filter">경제 발표 분류<select value={category} onChange={(event) => setCategory(event.target.value as keyof typeof CATEGORIES)}>{Object.entries(CATEGORIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {events.length ? <ol>{events.map((event) => <li key={event.id}><EventDate date={event.date} today={today} /><div><b>{event.name}</b><span className={`calendar-category ${event.category}`}>{CATEGORIES[event.category]}</span></div></li>)}</ol> : <p className="card-empty">선택한 조건에 예정된 경제 발표가 없습니다. 기간이나 분류를 바꿔보세요.</p>}
      </article>
      <article className="calendar-card"><header><h3>관심종목 실적 발표</h3><span>Alpha Vantage</span></header>
        <label className="investor-search calendar-filter"><span className="sr-only">실적 종목 검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="티커 또는 회사명 검색" /></label>
        {earnings.length ? <ol>{earnings.map((event) => <li key={`${event.ticker}:${event.reportDate}`}><EventDate date={event.reportDate} today={today} /><div><b>{event.ticker} <small>{event.companyName}</small></b><span>{event.estimate == null ? "EPS 추정 없음" : `EPS 추정 ${event.estimate}${event.currency ? ` ${event.currency}` : ""}`}</span></div></li>)}</ol> : <p className="card-empty">선택한 조건에 예정된 실적이 없습니다. <Link href="/portfolio">보유·관심종목 확인</Link></p>}
      </article>
    </div>
    <p className="investor-help">오늘을 포함한 {days}일 · 저장된 일정 기준이며 발표일은 변경될 수 있습니다. 발표 시각과 장전·장후 구분은 제공되지 않습니다.</p>
  </section>;
}
