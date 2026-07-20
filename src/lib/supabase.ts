import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DashboardSnapshot, RefreshRunStatus, RefreshSource, StoredSnapshot } from "@/lib/types";

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

function mapRefreshRun(row: Record<string, unknown>): RefreshRunStatus {
  return {
    id: row.id as string,
    source: row.source === "macro" || row.source === "social" ? row.source : null,
    status: row.status as RefreshRunStatus["status"],
    stage: (row.stage as RefreshRunStatus["stage"] | undefined) ?? null,
    workflowRunId: (row.workflow_run_id as string | null | undefined) ?? null,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null | undefined) ?? null,
    error: (row.error_summary as string | null | undefined) ?? null,
  };
}

export async function getLatestRefreshRun(): Promise<RefreshRunStatus | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const full = await supabase
    .from("refresh_runs")
    .select("id, source, status, stage, workflow_run_id, started_at, finished_at, error_summary")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!full.error) return full.data ? mapRefreshRun(full.data) : null;

  const migrationMissing = full.error.code === "42703" || full.error.code === "PGRST204";
  if (!migrationMissing) {
    if (full.error.code === "42P01") return null;
    throw new Error(`갱신 상태 조회 실패: ${full.error.message}`);
  }

  const legacy = await supabase
    .from("refresh_runs")
    .select("id, status, started_at, finished_at, error_summary")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legacy.error) throw new Error(`갱신 상태 조회 실패: ${legacy.error.message}`);
  return legacy.data ? mapRefreshRun(legacy.data) : null;
}

export function getSnapshotSource(snapshot: StoredSnapshot): RefreshSource | null {
  if (snapshot.payload.refreshSource === "macro" || snapshot.payload.refreshSource === "social") {
    return snapshot.payload.refreshSource;
  }

  const generatedAt = snapshot.payload.generatedAt;
  const macroMatches = snapshot.payload.macroUpdatedAt === generatedAt;
  const socialMatches = snapshot.payload.socialUpdatedAt === generatedAt;
  if (macroMatches !== socialMatches) return macroMatches ? "macro" : "social";
  return null;
}

export async function getSnapshotHistory(limit = 100): Promise<StoredSnapshot[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("id, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (error.code === "42P01") return [];
    throw new Error(`히스토리 조회 실패: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    payload: row.payload as DashboardSnapshot,
  }));
}

export async function getSnapshotById(id: string): Promise<StoredSnapshot | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("dashboard_snapshots")
    .select("id, created_at, payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`히스토리 상세 조회 실패: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    createdAt: data.created_at as string,
    payload: data.payload as DashboardSnapshot,
  };
}

export interface HistorySettingsResult {
  retentionLimit: number;
  migrationReady: boolean;
}

export async function getHistorySettings(): Promise<HistorySettingsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { retentionLimit: 30, migrationReady: false };

  const { data, error } = await supabase
    .from("dashboard_settings")
    .select("history_retention_limit")
    .eq("id", "primary")
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { retentionLimit: 30, migrationReady: false };
    }
    throw new Error(`히스토리 설정 조회 실패: ${error.message}`);
  }
  return {
    retentionLimit: (data?.history_retention_limit as number | undefined) ?? 30,
    migrationReady: true,
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
  if (!source || source === "social") {
    required.push(["X_BEARER_TOKEN", process.env.X_BEARER_TOKEN]);
    required.push(["OPENAI_API_KEY", process.env.OPENAI_API_KEY]);
  }
  return required.filter(([, value]) => !value).map(([name]) => name);
}
