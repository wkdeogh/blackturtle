import { fearGreedBand } from "@/lib/fear-greed-band";

export type MacroChartTone = "default" | "risk" | "sentiment";
export interface ChartCoordinate { x: number; y: number; value: number }
export interface ColoredChartSegment { color: string; points: ChartCoordinate[] }

const SENTIMENT_COLORS: Record<string, string> = {
  "extreme-fear": "#a94c47", fear: "#d87a63", neutral: "#737e78",
  greed: "#4f9273", "extreme-greed": "#257653",
};

export function macroChartColor(value: number, tone: Exclude<MacroChartTone, "default">): string {
  if (tone === "sentiment") return SENTIMENT_COLORS[fearGreedBand(value).key];
  return value < 20 ? "#4f9273" : value < 30 ? "#e38336" : "#c6655a";
}

// Split at exact value boundaries, then use solid strokes. This keeps band
// colors independent of SVG gradient coordinate handling on Safari/iOS.
export function buildMacroChartSegments(points: ChartCoordinate[], tone: Exclude<MacroChartTone, "default">): ColoredChartSegment[] {
  const boundaries = tone === "sentiment" ? [25, 45, 55, 75] : [20, 30];
  const segments: ColoredChartSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const low = Math.min(start.value, end.value);
    const high = Math.max(start.value, end.value);
    const fractions = [0, ...boundaries.filter((value) => value > low && value < high)
      .map((value) => (value - start.value) / (end.value - start.value)), 1].sort((a, b) => a - b);
    const interpolate = (fraction: number): ChartCoordinate => ({
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
      value: start.value + (end.value - start.value) * fraction,
    });
    for (let part = 1; part < fractions.length; part += 1) {
      const left = interpolate(fractions[part - 1]);
      const right = interpolate(fractions[part]);
      const color = macroChartColor((left.value + right.value) / 2, tone);
      const previous = segments.at(-1);
      if (previous?.color === color) previous.points.push(right);
      else segments.push({ color, points: [left, right] });
    }
  }
  return segments;
}
