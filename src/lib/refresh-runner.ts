import { collectFredData } from "@/lib/fred";
import { getLatestSnapshot, getMissingConfiguration, getXMonitorSettings } from "@/lib/supabase";
import type { DashboardSnapshot, RefreshSource } from "@/lib/types";
import { collectXData } from "@/lib/x-api";

export function refreshErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 600);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 600);

  // Workflow 단계의 오류는 실행 경계를 통과하면서 일반 객체로 직렬화될 수 있다.
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    if (typeof value.message === "string" && value.message.trim()) {
      return value.message.trim().slice(0, 600);
    }
    if (value.cause && typeof value.cause === "object") {
      const cause = value.cause as Record<string, unknown>;
      if (typeof cause.message === "string" && cause.message.trim()) {
        return cause.message.trim().slice(0, 600);
      }
    }
  }

  const rendered = String(error);
  if (rendered && rendered !== "[object Object]") return rendered.slice(0, 600);
  return "알 수 없는 갱신 오류가 발생했습니다.";
}

export async function collectRefreshSnapshot(source: RefreshSource): Promise<DashboardSnapshot> {
  const missing = getMissingConfiguration(source);
  if (missing.length) throw new Error(`설정되지 않은 환경 변수: ${missing.join(", ")}`);

  const previous = await getLatestSnapshot();
  const now = new Date().toISOString();
  let macro = previous?.payload.macro ?? [];
  let social = previous?.payload.social ?? {
    periodDays: 7,
    accounts: [],
    posts: [],
    companies: [],
    analyzedPostCount: 0,
  };

  if (source === "macro") {
    macro = await collectFredData(process.env.FRED_API_KEY!);
  } else {
    const { usernames, lookbackDays, perAccountPostLimit, totalPostLimit } = await getXMonitorSettings();
    if (!usernames.length) throw new Error("계정 설정에서 모니터링할 X 계정을 한 개 이상 저장하세요.");
    social = await collectXData(
      process.env.X_BEARER_TOKEN!,
      usernames,
      lookbackDays,
      perAccountPostLimit,
      totalPostLimit,
      process.env.OPENAI_API_KEY!,
      process.env.OPENAI_MODEL ?? "gpt-5-nano",
      previous?.payload.social,
    );
  }

  return {
    version: 1,
    generatedAt: now,
    refreshSource: source,
    macroUpdatedAt: source === "macro" ? now : previous?.payload.macroUpdatedAt ?? previous?.payload.generatedAt,
    socialUpdatedAt: source === "social" ? now : previous?.payload.socialUpdatedAt ?? previous?.payload.generatedAt,
    socialCollectedAt: source === "social" ? now : previous?.payload.socialCollectedAt,
    socialAnalyzedAt: source === "social" ? now : previous?.payload.socialAnalyzedAt,
    macro,
    social,
  };
}
