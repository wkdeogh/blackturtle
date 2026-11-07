import { buildMarketNotifications, nasdaqNotificationPeak } from "@/lib/market-notifications";
import { getLatestSnapshot, getSupabaseAdmin } from "@/lib/supabase";
import type { DashboardSnapshot } from "@/lib/types";

export async function publishRefreshWithNotifications(runId: string, recoveryError?: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  const { data: existing, error: existingError } = await supabase.from("dashboard_snapshots").select("id").eq("refresh_run_id", runId).maybeSingle();
  if (existingError) throw new Error(`스냅샷 조회 실패: ${existingError.message}`);
  if (existing) return true;
  const { data: run, error: draftError } = await supabase.from("refresh_runs").select("draft_payload").eq("id", runId).maybeSingle();
  if (draftError) throw new Error(`갱신 임시 데이터 조회 실패: ${draftError.message}`);
  const previous = await getLatestSnapshot();
  const { data: state, error: stateError } = await supabase.from("push_notification_state").select("nasdaq_peak").eq("id", "primary").maybeSingle();
  if (stateError) throw new Error(`푸시 알림 기준 조회 실패: ${stateError.message}`);
  const current = run?.draft_payload as DashboardSnapshot | null;
  const peak = state?.nasdaq_peak ?? 0;
  const events = current ? buildMarketNotifications(previous?.payload ?? null, current, peak) : [];
  const { data, error } = await supabase.rpc("publish_refresh_with_notifications", {
    p_run_id: runId, p_events: events,
    p_nasdaq_peak: current ? nasdaqNotificationPeak(previous?.payload ?? null, current, peak) : peak,
    p_recovery_error: recoveryError ?? null,
  });
  if (error) throw new Error(`스냅샷·푸시 대기열 저장 실패: ${error.message}`);
  return Boolean(data);
}
