import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DashboardSnapshot, RefreshSource, StoredSnapshot } from "@/lib/types";

let adminClient: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    adminClient = null;
    return null;
  }
  adminClient = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

export async function getLatestSnapshot(): Promise<StoredSnapshot | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: state, error: stateError } = await supabase
    .from("dashboard_state")
    .select("published_snapshot_id")
    .eq("id", "primary")
    .maybeSingle();

  if (stateError) {
    if (stateError.code === "42P01") return null;
    throw new Error(`대시보드 상태 조회 실패: ${stateError.message}`);
  }
  if (!state?.published_snapshot_id) return null;

  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("id, created_at, payload")
    .eq("id", state.published_snapshot_id)
    .single();

  if (error) throw new Error(`스냅샷 조회 실패: ${error.message}`);
  return {
    id: data.id as string,
    createdAt: data.created_at as string,
    payload: data.payload as DashboardSnapshot,
  };
}

export interface XMonitorSettingsResult {
  usernames: string[];
  lookbackDays: number;
  perAccountPostLimit: number | null;
  totalPostLimit: number | null;
  source: "database" | "environment" | "none";
}

function optionalPositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function environmentAccounts(): string[] {
  return (process.env.X_TARGET_USERNAMES ?? "")
    .split(",")
    .map((username) => username.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

function environmentLookbackDays(): number {
  const parsed = Number(process.env.X_LOOKBACK_DAYS ?? 7);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 7;
}

export async function getXMonitorSettings(): Promise<XMonitorSettingsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      usernames: environmentAccounts(),
      lookbackDays: environmentLookbackDays(),
      perAccountPostLimit: optionalPositiveInteger(process.env.X_PER_ACCOUNT_POST_LIMIT),
      totalPostLimit: optionalPositiveInteger(process.env.X_TOTAL_POST_LIMIT),
      source: process.env.X_TARGET_USERNAMES ? "environment" : "none",
    };
  }

  const [accountsResult, settingsResult] = await Promise.all([
    supabase.from("x_monitored_accounts").select("username").order("position"),
    supabase.from("x_monitor_settings").select("lookback_days, per_account_post_limit, total_post_limit").eq("id", "primary").maybeSingle(),
  ]);

  const error = accountsResult.error ?? settingsResult.error;
  if (error) {
    if (error.code === "42P01") {
      const fallback = environmentAccounts();
      return {
        usernames: fallback,
        lookbackDays: environmentLookbackDays(),
        perAccountPostLimit: optionalPositiveInteger(process.env.X_PER_ACCOUNT_POST_LIMIT),
        totalPostLimit: optionalPositiveInteger(process.env.X_TOTAL_POST_LIMIT),
        source: fallback.length ? "environment" : "none",
      };
    }
    throw new Error(`X 모니터링 설정 조회 실패: ${error.message}`);
  }

  return {
    usernames: (accountsResult.data ?? []).map((row) => row.username as string),
    lookbackDays: (settingsResult.data?.lookback_days as number | undefined) ?? 7,
    perAccountPostLimit: (settingsResult.data?.per_account_post_limit as number | null | undefined) ?? null,
    totalPostLimit: (settingsResult.data?.total_post_limit as number | null | undefined) ?? null,
    source: "database",
  };
}

export function getMissingConfiguration(source?: RefreshSource): string[] {
  const required: Array<[string, string | undefined]> = [
    ["SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
  ];
  if (!source || source === "macro") required.push(["FRED_API_KEY", process.env.FRED_API_KEY]);
  if (!source || source === "social") required.push(["X_BEARER_TOKEN", process.env.X_BEARER_TOKEN]);
  return required.filter(([, value]) => !value).map(([name]) => name);
}
