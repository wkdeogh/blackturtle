import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MacroLineChart } from "@/components/macro-line-chart";
import { buildMacroChartSegments, type ChartCoordinate } from "@/lib/macro-chart-segments";
import type { MacroSeries } from "@/lib/types";

function coordinates(values: number[]): ChartCoordinate[] {
  return values.map((value, index) => ({ x: index / (values.length - 1) * 100, y: 100 - value, value }));
}

describe("macro chart band colors", () => {
  it("splits a single jump across all fear-greed boundaries at their exact positions", () => {
    const segments = buildMacroChartSegments(coordinates([10, 90]), "sentiment");
    expect(segments.map((segment) => segment.color)).toEqual(["#a94c47", "#d87a63", "#737e78", "#4f9273", "#257653"]);
    expect(segments.map((segment) => segment.points.map((point) => point.value))).toEqual([[10, 25], [25, 45], [45, 55], [55, 75], [75, 90]]);
    expect(segments[0].points[1]).toEqual({ x: 18.75, y: 75, value: 25 });
  });
  it("preserves the continuous price line on both rising and falling crossings", () => {
    const points = coordinates([10, 90, 10]);
    const segments = buildMacroChartSegments(points, "sentiment");
    expect(segments.map((segment) => segment.color)).toEqual(["#a94c47", "#d87a63", "#737e78", "#4f9273", "#257653", "#4f9273", "#737e78", "#d87a63", "#a94c47"]);
    expect(segments[0].points[0]).toEqual(points[0]);
    expect(segments.at(-1)!.points.at(-1)).toEqual(points.at(-1));
    segments.slice(1).forEach((segment, index) => expect(segment.points[0]).toEqual(segments[index].points.at(-1)));
  });
  it("merges adjacent observations within one band and handles a flat boundary", () => {
    const segments = buildMacroChartSegments(coordinates([25, 25, 25]), "sentiment");
    expect(segments).toEqual([{ color: "#d87a63", points: coordinates([25, 25, 25]) }]);
  });
  it("uses the same exact-boundary rendering for VIX 20 and 30", () => {
    const segments = buildMacroChartSegments(coordinates([40, 10]), "risk");
    expect(segments.map((segment) => segment.color)).toEqual(["#c6655a", "#e38336", "#4f9273"]);
    expect(segments.map((segment) => segment.points.map((point) => point.value))).toEqual([[40, 30], [30, 20], [20, 10]]);
  });
  it("renders every band as an explicit SVG stroke, without gradient lookup", () => {
    const series: MacroSeries = { id: "CNN_FEAR_GREED", label: "공포·탐욕", group: "심리", unit: "점", decimals: 0, current: 90, previous: 10, change: 80, observationDate: "2026-11-06", points: [{ date: "2026-11-05", value: 10 }, { date: "2026-11-06", value: 90 }] };
    const html = renderToStaticMarkup(createElement(MacroLineChart, { series, tone: "sentiment", fixedMin: 0, fixedMax: 100 }));
    for (const color of ["#a94c47", "#d87a63", "#737e78", "#4f9273", "#257653"]) expect(html).toContain(`stroke:${color}`);
    expect(html).not.toContain("linearGradient");
    expect(html).not.toContain("url(#");
    expect(html.match(/class="chart-data-line"/g)).toHaveLength(5);
  });
});
