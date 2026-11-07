import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSameOriginPost } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPushConfiguration, pushErrorStatus, sendWebPush } from "@/lib/web-push";
import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/push-subscription";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const config = getPushConfiguration();
  const supabase = getSupabaseAdmin();
  const check = supabase ? await supabase.from("push_subscriptions").select("id").limit(0) : null;
  return NextResponse.json({ publicKey: config?.publicKey ?? null, ready: Boolean(config && check && !check.error) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 연결이 설정되지 않았습니다." }, { status: 503 });
  let body: { action?: string; subscription?: unknown; endpoint?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  if (body.action === "subscribe") {
    if (!getPushConfiguration()) return NextResponse.json({ error: "푸시 알림 서버 설정이 필요합니다." }, { status: 503 });
    const parsed = pushSubscriptionSchema.safeParse(body.subscription);
    if (!parsed.success) return NextResponse.json({ error: "푸시 구독 정보가 올바르지 않습니다." }, { status: 400 });
    const { error } = await supabase.from("push_subscriptions").upsert({
      endpoint: parsed.data.endpoint, subscription: parsed.data, updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) return NextResponse.json({ error: "푸시 구독을 저장하지 못했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const parsed = pushEndpointSchema.safeParse(body.endpoint);
  if (!parsed.success) return NextResponse.json({ error: "푸시 구독 정보가 올바르지 않습니다." }, { status: 400 });
  if (body.action === "unsubscribe") {
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data);
    return error ? NextResponse.json({ error: "푸시 구독을 해제하지 못했습니다." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (body.action === "status" || body.action === "test") {
    const { data, error } = await supabase.from("push_subscriptions").select("id, subscription").eq("endpoint", parsed.data).maybeSingle();
    if (error) return NextResponse.json({ error: "푸시 구독을 확인하지 못했습니다." }, { status: 500 });
    if (body.action === "status") return NextResponse.json({ subscribed: Boolean(data) });
    if (!data) return NextResponse.json({ error: "먼저 알림을 켜 주세요." }, { status: 404 });
    try {
      await sendWebPush(pushSubscriptionSchema.parse(data.subscription), { title: "Black Turtle 알림", body: "푸시 알림이 연결되었습니다.", url: "/macro", tag: "blackturtle-test" });
      return NextResponse.json({ ok: true });
    } catch (caught) {
      const status = pushErrorStatus(caught);
      if (status === 404 || status === 410) await supabase.from("push_subscriptions").delete().eq("id", data.id);
      return NextResponse.json({ error: status === 404 || status === 410 ? "구독이 만료되었습니다. 알림을 다시 켜 주세요." : "테스트 알림을 전송하지 못했습니다." }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
