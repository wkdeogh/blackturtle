import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MAX_ACTIVE_X_ACCOUNTS, MAX_SAVED_X_ACCOUNTS } from "@/lib/x-account-limits";

interface AccountInput {
  username: string;
  enabled: boolean;
}

function normalizeAccounts(values: unknown): AccountInput[] | null {
  if (!Array.isArray(values)) return null;
  const accounts = values.map((value): AccountInput | null => {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.username !== "string" || typeof raw.enabled !== "boolean") return null;
    return { username: raw.username.trim().replace(/^@/, "").toLowerCase(), enabled: raw.enabled };
  });
  if (accounts.some((account) => account === null)) return null;
  const normalized = accounts as AccountInput[];
  if (normalized.length > MAX_SAVED_X_ACCOUNTS) return null;
  if (normalized.filter(({ enabled }) => enabled).length > MAX_ACTIVE_X_ACCOUNTS) return null;
  if (normalized.some(({ username }) => !/^[a-z0-9_]{1,30}$/.test(username))) return null;
  if (new Set(normalized.map(({ username }) => username)).size !== normalized.length) return null;
  return normalized;
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let values: unknown;
  try {
    const body = (await request.json()) as { accounts?: unknown };
    values = body.accounts;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const accounts = normalizeAccounts(values);
  if (!accounts) {
    return NextResponse.json(
      { error: `계정은 최대 ${MAX_SAVED_X_ACCOUNTS}개까지 저장하고 ${MAX_ACTIVE_X_ACCOUNTS}개까지 활성화할 수 있으며, username에는 영문·숫자·밑줄만 사용할 수 있습니다.` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  }

  const { error } = await supabase.rpc("replace_x_monitored_accounts_v3", {
    p_usernames: accounts.map(({ username }) => username),
    p_enabled: accounts.map(({ enabled }) => enabled),
  });
  if (error) {
    const migrationMissing = error.message.includes("replace_x_monitored_accounts_v3") || error.code === "PGRST202";
    return NextResponse.json(
      {
        error: migrationMissing
          ? "Supabase에서 202607220009_x_account_limits.sql을 먼저 실행하세요."
          : `계정 저장 실패: ${error.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, accounts });
}
