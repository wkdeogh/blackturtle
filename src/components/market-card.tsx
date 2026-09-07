"use client";

import { useMemo, useState } from "react";
import { DeferredRender } from "@/components/deferred-render";
import { MarketChart } from "@/components/market-chart";
import { marketDrawdownForRange, marketRangeLabel, type MarketChartRange } from "@/lib/market-chart-range";
import { marketTechnicals } from "@/lib/market-regime";
import type { MarketSnapshot, MarketSeries } from "@/lib/types";

function formatPrice(series: MarketSeries, value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: series.decimals,
    maximumFractionDigits: series.decimals,
  }).format(value);
}

function instrumentLabel(series: MarketSeries): string {
  return series.instrumentType === "index" ? "실제 지수" : series.instrumentType === "etf" ? "ETF" : series.instrumentType === "forex" ? "환율" : "암호화폐";
}

function chartTone(series: MarketSeries): "green" | "amber" | "blue" {
  if (series.id === "gold") return "amber";
  if (series.id === "bitcoin" || series.id === "usdkrw" || series.id === "dollar_index") return "blue";
  return "green";
}

export function MarketCard({ series, provider }: { series: MarketSeries; provider: MarketSnapshot["provider"] }) {
  const [range, setRange] = useState<MarketChartRange>("1Y");
  const rangeDrawdown = useMemo(() => marketDrawdownForRange(series.points, range), [range, series.points]);
  const drawdown = rangeDrawdown?.drawdownPercent ?? 0;
  const peakValue = rangeDrawdown?.peakValue ?? series.peakValue;
  const peakDate = rangeDrawdown?.peakDate ?? series.peakDate;
  const rangeLabel = marketRangeLabel(range);
  const technicals = marketTechnicals(series);

  return (
    <article className="market-card">
      <header className="market-card-head">
        <div><span className="data-tag">{instrumentLabel(series)} · {series.symbol} · {series.interval === "daily" ? "일간" : "주간"}</span><h3>{series.label}</h3></div>
        <time dateTime={series.observationDate}>{series.observationDate}</time>
      </header>
      <div className="market-price-row"><strong>{formatPrice(series, series.current)}</strong><span>{series.currency}</span></div>
      <div className="market-stat-row">
        <div><span>{series.interval === "daily" ? "전일 대비" : "전주 대비"}</span><b className={(series.changePercent ?? 0) >= 0 ? "up" : "down"}>{series.changePercent === null ? "-" : `${series.changePercent >= 0 ? "+" : ""}${series.changePercent.toFixed(2)}%`}</b></div>
        <div><span>{rangeLabel} 고점 대비</span><b className={drawdown < -10 ? "down" : ""}>{drawdown.toFixed(2)}%</b></div>
      </div>
      <div className="technical-strip">
        <span>1M <b className={(technicals.oneMonth ?? 0) >= 0 ? "up" : "down"}>{technicals.oneMonth === null ? "-" : `${technicals.oneMonth > 0 ? "+" : ""}${technicals.oneMonth.toFixed(1)}%`}</b></span>
        <span>3M <b className={(technicals.threeMonths ?? 0) >= 0 ? "up" : "down"}>{technicals.threeMonths === null ? "-" : `${technicals.threeMonths > 0 ? "+" : ""}${technicals.threeMonths.toFixed(1)}%`}</b></span>
        <span>20D 변동성 <b>{technicals.realizedVolatility20D === null ? "-" : `${technicals.realizedVolatility20D.toFixed(1)}%`}</b></span>
        <span>200D <b className={technicals.above200Day === true ? "up" : technicals.above200Day === false ? "down" : ""}>{technicals.above200Day === null ? "-" : technicals.above200Day ? "위" : "아래"}</b></span>
      </div>
      <DeferredRender className="deferred-chart" minHeight={225}>
        <MarketChart points={series.points} decimals={series.decimals} currency={series.currency} tone={chartTone(series)} range={range} onRangeChange={setRange} />
      </DeferredRender>
      <footer className="market-card-foot">
        <span>{rangeLabel} 종가 고점 {formatPrice(series, peakValue)} · {peakDate}</span>
        <span>{series.benchmark ? `${series.benchmark} · ${provider}` : provider}</span>
      </footer>
    </article>
  );
}
