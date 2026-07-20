import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DashboardSnapshot, StoredSnapshot } from "@/lib/types";

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

export function getMissingConfiguration(): string[] {
  const required: Array<[string, string | undefined]> = [
    ["SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
    ["FRED_API_KEY", process.env.FRED_API_KEY],
    ["X_BEARER_TOKEN", process.env.X_BEARER_TOKEN],
    ["X_TARGET_USERNAMES", process.env.X_TARGET_USERNAMES],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}
